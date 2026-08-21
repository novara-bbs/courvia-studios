import { sql } from '@payloadcms/db-postgres'
import type { MigrateDownArgs, MigrateUpArgs } from '@payloadcms/db-postgres'

/**
 * Fase 3 — plantillas de PDP, papelera, versiones en los tres globals, y el
 * renombrado que hace posible lo tercero.
 *
 * ---------------------------------------------------------------------------
 * Por qué esta migración tiene partes escritas a mano
 * ---------------------------------------------------------------------------
 *
 * El diff de esquema de drizzle no distingue un renombrado de un borrado más
 * una creación. `market-settings` recibe `dbName: "markets"` —sin ese nombre
 * corto, su tabla de versiones genera enums de 65 caracteres y Payload no
 * arranca; está medido en `market-settings.ts`— y el diff, por su cuenta,
 * habría emitido DROP TABLE + CREATE TABLE. Eso se lleva por delante las
 * pasarelas configuradas de los tres mercados: justo el dato que no se puede
 * perder en silencio.
 *
 * Por eso el bloque 1 está escrito a mano. Son ALTER … RENAME, que conservan
 * las filas, y renombran además índices, claves primarias, claves ajenas y
 * secuencias, porque Postgres NO los renombra al renombrar la tabla — y un
 * índice que conservara el nombre viejo haría que el siguiente diff creyera
 * que falta el nuevo e intentara crearlo. Va dentro de un bloque plpgsql
 * porque así el recuento de filas de antes y el de después viven en la misma
 * ejecución: el renombrado no se afirma, se comprueba.
 *
 * El bloque 2 es el diff generado, sin tocar una línea. Se generó contra una
 * copia del snapshot anterior con el renombrado ya aplicado: así emite todo
 * lo demás y nada de esto.
 *
 * El bloque 3 son los dos índices únicos parciales que Payload no sabe
 * declarar —`src/payload/trash.ts` explica por qué una papelera y un UNIQUE
 * total no pueden convivir— y el barrido de RLS con su comprobación, igual
 * que en `20260821_214924_commerce_ownership`.
 *
 * ---------------------------------------------------------------------------
 * Y una palabra en el `down` generado
 * ---------------------------------------------------------------------------
 *
 * Tres `DROP CONSTRAINT` del `down` llevan `IF EXISTS`, que el generador no
 * pone. Las tres cuelgan de `templates`, y el `down` la borra con CASCADE
 * unas líneas antes: sin `IF EXISTS`, la vuelta atrás muere diciendo que una
 * restricción que acaba de llevarse el CASCADE «no existe». Medido: la
 * primera pasada de `migrate:down` falló exactamente ahí. Con la palabra
 * puesta, el viaje completo —migrar, deshacer, volver a migrar— se hizo
 * contra una base construida desde cero y terminó con el esquema idéntico.
 *
 * Las migraciones anteriores tienen la misma fragilidad en su `down`; no se
 * tocan aquí porque su `up` ya corrió en todas partes y ensanchar este diff
 * para arreglar una vuelta atrás que nadie ha pedido cambia el radio de
 * impacto sin necesidad.
 */

export async function up({ db }: MigrateUpArgs): Promise<void> {
  /* =====================================================================
   * 1 — El renombrado. A mano, con las filas intactas, y comprobado.
   * ===================================================================== */
  await db.execute(sql`
    DO $$
    DECLARE
      before_settings int;
      before_markets int;
      before_providers int;
      before_methods int;
      leftovers int;
    BEGIN
      SELECT count(*) INTO before_settings FROM payload.market_settings;
      SELECT count(*) INTO before_markets FROM payload.market_settings_markets;
      SELECT count(*) INTO before_providers
        FROM payload.market_settings_markets_payment_providers;
      SELECT count(*) INTO before_methods
        FROM payload.market_settings_markets_payment_providers_methods;

      ALTER TABLE payload.market_settings RENAME TO markets;
      ALTER TABLE payload.market_settings_markets RENAME TO markets_markets;
      ALTER TABLE payload.market_settings_markets_payment_providers
        RENAME TO markets_markets_payment_providers;
      ALTER TABLE payload.market_settings_markets_payment_providers_methods
        RENAME TO markets_markets_payment_providers_methods;

      ALTER TYPE payload.enum_market_settings_markets_market
        RENAME TO enum_markets_markets_market;
      ALTER TYPE payload.enum_market_settings_markets_payment_providers_provider
        RENAME TO enum_markets_markets_payment_providers_provider;
      ALTER TYPE payload.enum_market_settings_markets_payment_providers_methods
        RENAME TO enum_markets_markets_payment_providers_methods;

      ALTER INDEX payload.market_settings_markets_order_idx
        RENAME TO markets_markets_order_idx;
      ALTER INDEX payload.market_settings_markets_parent_id_idx
        RENAME TO markets_markets_parent_id_idx;
      ALTER INDEX payload.market_settings_markets_payment_providers_order_idx
        RENAME TO markets_markets_payment_providers_order_idx;
      ALTER INDEX payload.market_settings_markets_payment_providers_parent_id_idx
        RENAME TO markets_markets_payment_providers_parent_id_idx;
      ALTER INDEX payload.market_settings_markets_payment_providers_methods_order_idx
        RENAME TO markets_markets_payment_providers_methods_order_idx;
      ALTER INDEX payload.market_settings_markets_payment_providers_methods_parent_idx
        RENAME TO markets_markets_payment_providers_methods_parent_idx;

      -- Renombrar una restricción renombra también su índice, así que las
      -- claves primarias van por aquí y no con ALTER INDEX.
      ALTER TABLE payload.markets
        RENAME CONSTRAINT market_settings_pkey TO markets_pkey;
      ALTER TABLE payload.markets_markets
        RENAME CONSTRAINT market_settings_markets_pkey TO markets_markets_pkey;
      ALTER TABLE payload.markets_markets_payment_providers
        RENAME CONSTRAINT market_settings_markets_payment_providers_pkey
        TO markets_markets_payment_providers_pkey;
      ALTER TABLE payload.markets_markets_payment_providers_methods
        RENAME CONSTRAINT market_settings_markets_payment_providers_methods_pkey
        TO markets_markets_payment_providers_methods_pkey;

      ALTER TABLE payload.markets_markets
        RENAME CONSTRAINT market_settings_markets_parent_id_fk
        TO markets_markets_parent_id_fk;
      ALTER TABLE payload.markets_markets_payment_providers
        RENAME CONSTRAINT market_settings_markets_payment_providers_parent_id_fk
        TO markets_markets_payment_providers_parent_id_fk;
      ALTER TABLE payload.markets_markets_payment_providers_methods
        RENAME CONSTRAINT market_settings_markets_payment_providers_methods_parent_fk
        TO markets_markets_payment_providers_methods_parent_fk;

      ALTER SEQUENCE payload.market_settings_id_seq RENAME TO markets_id_seq;
      ALTER SEQUENCE payload.market_settings_markets_payment_providers_methods_id_seq
        RENAME TO markets_markets_payment_providers_methods_id_seq;

      IF (SELECT count(*) FROM payload.markets) <> before_settings
         OR (SELECT count(*) FROM payload.markets_markets) <> before_markets
         OR (SELECT count(*) FROM payload.markets_markets_payment_providers)
            <> before_providers
         OR (SELECT count(*) FROM payload.markets_markets_payment_providers_methods)
            <> before_methods
      THEN
        RAISE EXCEPTION 'fase3: el renombrado de market_settings perdió filas';
      END IF;

      SELECT count(*) INTO leftovers FROM pg_tables
      WHERE schemaname = 'payload' AND left(tablename, 15) = 'market_settings';
      IF leftovers <> 0 THEN
        RAISE EXCEPTION 'fase3: quedan % tabla(s) con el nombre viejo', leftovers;
      END IF;
    END $$;
  `)

  /* =====================================================================
   * 2 — El diff generado, sin tocar una línea.
   * ===================================================================== */
  await db.execute(sql`
   CREATE TYPE "payload"."enum_templates_blocks_stage_level" AS ENUM('h2', 'h1');
  CREATE TYPE "payload"."enum_templates_blocks_stage_appearance_space_block_start" AS ENUM('none', 'sm', 'md', 'lg', 'xl');
  CREATE TYPE "payload"."enum_templates_blocks_stage_appearance_space_block_end" AS ENUM('none', 'sm', 'md', 'lg', 'xl');
  CREATE TYPE "payload"."enum_templates_blocks_stage_appearance_background" AS ENUM('none', 'surface', 'raised', 'inverse', 'accent');
  CREATE TYPE "payload"."enum_templates_blocks_stage_appearance_height" AS ENUM('auto', 'tall', 'full');
  CREATE TYPE "payload"."enum_templates_blocks_stage_appearance_overlay" AS ENUM('none', 'soft', 'strong', 'gradient');
  CREATE TYPE "payload"."enum_templates_blocks_stage_appearance_align" AS ENUM('start', 'center');
  CREATE TYPE "payload"."enum_templates_blocks_stage_appearance_width" AS ENUM('prose', 'content', 'full');
  CREATE TYPE "payload"."enum_templates_blocks_stage_appearance_reveal" AS ENUM('none', 'rise', 'settle');
  CREATE TYPE "payload"."enum_templates_blocks_stage_appearance_theme_scope" AS ENUM('inherit', 'volt', 'carbon', 'club');
  CREATE TYPE "payload"."enum_templates_blocks_hero_level" AS ENUM('h2', 'h1');
  CREATE TYPE "payload"."enum_templates_blocks_hero_appearance_space_block_start" AS ENUM('none', 'sm', 'md', 'lg', 'xl');
  CREATE TYPE "payload"."enum_templates_blocks_hero_appearance_space_block_end" AS ENUM('none', 'sm', 'md', 'lg', 'xl');
  CREATE TYPE "payload"."enum_templates_blocks_hero_appearance_background" AS ENUM('none', 'surface', 'raised', 'inverse', 'accent');
  CREATE TYPE "payload"."enum_templates_blocks_hero_appearance_align" AS ENUM('start', 'center');
  CREATE TYPE "payload"."enum_templates_blocks_hero_appearance_theme_scope" AS ENUM('inherit', 'volt', 'carbon', 'club');
  CREATE TYPE "payload"."enum_templates_blocks_anchor_nav_appearance_space_block_start" AS ENUM('none', 'sm', 'md', 'lg', 'xl');
  CREATE TYPE "payload"."enum_templates_blocks_anchor_nav_appearance_space_block_end" AS ENUM('none', 'sm', 'md', 'lg', 'xl');
  CREATE TYPE "payload"."enum_templates_blocks_anchor_nav_appearance_background" AS ENUM('none', 'surface', 'raised', 'inverse', 'accent');
  CREATE TYPE "payload"."enum_templates_blocks_anchor_nav_appearance_hidden_on" AS ENUM('never', 'mobile', 'desktop');
  CREATE TYPE "payload"."enum_templates_blocks_anchor_nav_appearance_theme_scope" AS ENUM('inherit', 'volt', 'carbon', 'club');
  CREATE TYPE "payload"."enum_templates_blocks_rich_text_appearance_space_block_start" AS ENUM('none', 'sm', 'md', 'lg', 'xl');
  CREATE TYPE "payload"."enum_templates_blocks_rich_text_appearance_space_block_end" AS ENUM('none', 'sm', 'md', 'lg', 'xl');
  CREATE TYPE "payload"."enum_templates_blocks_rich_text_appearance_width" AS ENUM('prose', 'content', 'full');
  CREATE TYPE "payload"."enum_templates_blocks_rich_text_appearance_theme_scope" AS ENUM('inherit', 'volt', 'carbon', 'club');
  CREATE TYPE "payload"."enum_templates_blocks_media_text_appearance_space_block_start" AS ENUM('none', 'sm', 'md', 'lg', 'xl');
  CREATE TYPE "payload"."enum_templates_blocks_media_text_appearance_space_block_end" AS ENUM('none', 'sm', 'md', 'lg', 'xl');
  CREATE TYPE "payload"."enum_templates_blocks_media_text_appearance_background" AS ENUM('none', 'surface', 'raised', 'inverse', 'accent');
  CREATE TYPE "payload"."enum_templates_blocks_media_text_appearance_media_position" AS ENUM('start', 'end');
  CREATE TYPE "payload"."enum_templates_blocks_media_text_appearance_theme_scope" AS ENUM('inherit', 'volt', 'carbon', 'club');
  CREATE TYPE "payload"."enum_templates_blocks_bento_items_span" AS ENUM('sm', 'md', 'lg');
  CREATE TYPE "payload"."enum_templates_blocks_bento_appearance_space_block_start" AS ENUM('none', 'sm', 'md', 'lg', 'xl');
  CREATE TYPE "payload"."enum_templates_blocks_bento_appearance_space_block_end" AS ENUM('none', 'sm', 'md', 'lg', 'xl');
  CREATE TYPE "payload"."enum_templates_blocks_bento_appearance_background" AS ENUM('none', 'surface', 'raised', 'inverse', 'accent');
  CREATE TYPE "payload"."enum_templates_blocks_bento_appearance_divider" AS ENUM('none', 'hairline', 'soft');
  CREATE TYPE "payload"."enum_templates_blocks_bento_appearance_reveal" AS ENUM('none', 'rise', 'settle');
  CREATE TYPE "payload"."enum_templates_blocks_bento_appearance_hidden_on" AS ENUM('never', 'mobile', 'desktop');
  CREATE TYPE "payload"."enum_templates_blocks_bento_appearance_theme_scope" AS ENUM('inherit', 'volt', 'carbon', 'club');
  CREATE TYPE "payload"."enum_templates_blocks_stat_band_appearance_space_block_start" AS ENUM('none', 'sm', 'md', 'lg', 'xl');
  CREATE TYPE "payload"."enum_templates_blocks_stat_band_appearance_space_block_end" AS ENUM('none', 'sm', 'md', 'lg', 'xl');
  CREATE TYPE "payload"."enum_templates_blocks_stat_band_appearance_background" AS ENUM('none', 'surface', 'raised', 'inverse', 'accent');
  CREATE TYPE "payload"."enum_templates_blocks_stat_band_appearance_align" AS ENUM('start', 'center');
  CREATE TYPE "payload"."enum_templates_blocks_stat_band_appearance_reveal" AS ENUM('none', 'rise', 'settle');
  CREATE TYPE "payload"."enum_templates_blocks_stat_band_appearance_theme_scope" AS ENUM('inherit', 'volt', 'carbon', 'club');
  CREATE TYPE "payload"."enum_templates_blocks_feature_grid_appearance_space_block_start" AS ENUM('none', 'sm', 'md', 'lg', 'xl');
  CREATE TYPE "payload"."enum_templates_blocks_feature_grid_appearance_space_block_end" AS ENUM('none', 'sm', 'md', 'lg', 'xl');
  CREATE TYPE "payload"."enum_templates_blocks_feature_grid_appearance_background" AS ENUM('none', 'surface', 'raised', 'inverse', 'accent');
  CREATE TYPE "payload"."enum_templates_blocks_feature_grid_appearance_columns" AS ENUM('2', '3', '4');
  CREATE TYPE "payload"."enum_templates_blocks_feature_grid_appearance_align" AS ENUM('start', 'center');
  CREATE TYPE "payload"."enum_templates_blocks_feature_grid_appearance_theme_scope" AS ENUM('inherit', 'volt', 'carbon', 'club');
  CREATE TYPE "payload"."enum_templates_blocks_steps_appearance_space_block_start" AS ENUM('none', 'sm', 'md', 'lg', 'xl');
  CREATE TYPE "payload"."enum_templates_blocks_steps_appearance_space_block_end" AS ENUM('none', 'sm', 'md', 'lg', 'xl');
  CREATE TYPE "payload"."enum_templates_blocks_steps_appearance_background" AS ENUM('none', 'surface', 'raised', 'inverse', 'accent');
  CREATE TYPE "payload"."enum_templates_blocks_steps_appearance_columns" AS ENUM('2', '3', '4');
  CREATE TYPE "payload"."enum_templates_blocks_steps_appearance_divider" AS ENUM('none', 'hairline', 'soft');
  CREATE TYPE "payload"."enum_templates_blocks_steps_appearance_reveal" AS ENUM('none', 'rise', 'settle');
  CREATE TYPE "payload"."enum_templates_blocks_steps_appearance_hidden_on" AS ENUM('never', 'mobile', 'desktop');
  CREATE TYPE "payload"."enum_templates_blocks_steps_appearance_theme_scope" AS ENUM('inherit', 'volt', 'carbon', 'club');
  CREATE TYPE "payload"."enum_templates_blocks_timeline_items_state" AS ENUM('done', 'current', 'next');
  CREATE TYPE "payload"."enum_templates_blocks_timeline_appearance_space_block_start" AS ENUM('none', 'sm', 'md', 'lg', 'xl');
  CREATE TYPE "payload"."enum_templates_blocks_timeline_appearance_space_block_end" AS ENUM('none', 'sm', 'md', 'lg', 'xl');
  CREATE TYPE "payload"."enum_templates_blocks_timeline_appearance_background" AS ENUM('none', 'surface', 'raised', 'inverse', 'accent');
  CREATE TYPE "payload"."enum_templates_blocks_timeline_appearance_reveal" AS ENUM('none', 'rise', 'settle');
  CREATE TYPE "payload"."enum_templates_blocks_timeline_appearance_theme_scope" AS ENUM('inherit', 'volt', 'carbon', 'club');
  CREATE TYPE "payload"."enum_templates_blocks_hotspots_points_col" AS ENUM('1', '2', '3', '4', '5', '6', '7', '8', '9', '10', '11', '12');
  CREATE TYPE "payload"."enum_templates_blocks_hotspots_points_row" AS ENUM('1', '2', '3', '4', '5', '6', '7', '8');
  CREATE TYPE "payload"."enum_templates_blocks_hotspots_appearance_space_block_start" AS ENUM('none', 'sm', 'md', 'lg', 'xl');
  CREATE TYPE "payload"."enum_templates_blocks_hotspots_appearance_space_block_end" AS ENUM('none', 'sm', 'md', 'lg', 'xl');
  CREATE TYPE "payload"."enum_templates_blocks_hotspots_appearance_background" AS ENUM('none', 'surface', 'raised', 'inverse', 'accent');
  CREATE TYPE "payload"."enum_templates_blocks_hotspots_appearance_width" AS ENUM('prose', 'content', 'full');
  CREATE TYPE "payload"."enum_templates_blocks_hotspots_appearance_reveal" AS ENUM('none', 'rise', 'settle');
  CREATE TYPE "payload"."enum_templates_blocks_hotspots_appearance_hidden_on" AS ENUM('never', 'mobile', 'desktop');
  CREATE TYPE "payload"."enum_templates_blocks_hotspots_appearance_theme_scope" AS ENUM('inherit', 'volt', 'carbon', 'club');
  CREATE TYPE "payload"."enum_templates_blocks_gallery_appearance_space_block_start" AS ENUM('none', 'sm', 'md', 'lg', 'xl');
  CREATE TYPE "payload"."enum_templates_blocks_gallery_appearance_space_block_end" AS ENUM('none', 'sm', 'md', 'lg', 'xl');
  CREATE TYPE "payload"."enum_templates_blocks_gallery_appearance_background" AS ENUM('none', 'surface', 'raised', 'inverse', 'accent');
  CREATE TYPE "payload"."enum_templates_blocks_gallery_appearance_columns" AS ENUM('2', '3', '4');
  CREATE TYPE "payload"."enum_templates_blocks_gallery_appearance_reveal" AS ENUM('none', 'rise', 'settle');
  CREATE TYPE "payload"."enum_templates_blocks_gallery_appearance_theme_scope" AS ENUM('inherit', 'volt', 'carbon', 'club');
  CREATE TYPE "payload"."enum_templates_blocks_spec_table_appearance_space_block_start" AS ENUM('none', 'sm', 'md', 'lg', 'xl');
  CREATE TYPE "payload"."enum_templates_blocks_spec_table_appearance_space_block_end" AS ENUM('none', 'sm', 'md', 'lg', 'xl');
  CREATE TYPE "payload"."enum_templates_blocks_spec_table_appearance_background" AS ENUM('none', 'surface', 'raised', 'inverse', 'accent');
  CREATE TYPE "payload"."enum_templates_blocks_spec_table_appearance_divider" AS ENUM('none', 'hairline', 'soft');
  CREATE TYPE "payload"."enum_templates_blocks_spec_table_appearance_reveal" AS ENUM('none', 'rise', 'settle');
  CREATE TYPE "payload"."enum_templates_blocks_spec_table_appearance_hidden_on" AS ENUM('never', 'mobile', 'desktop');
  CREATE TYPE "payload"."enum_templates_blocks_spec_table_appearance_theme_scope" AS ENUM('inherit', 'volt', 'carbon', 'club');
  CREATE TYPE "payload"."enum_prod_hero_appearance_space_block_start" AS ENUM('none', 'sm', 'md', 'lg', 'xl');
  CREATE TYPE "payload"."enum_prod_hero_appearance_space_block_end" AS ENUM('none', 'sm', 'md', 'lg', 'xl');
  CREATE TYPE "payload"."enum_prod_hero_appearance_background" AS ENUM('none', 'surface', 'raised', 'inverse', 'accent');
  CREATE TYPE "payload"."enum_prod_hero_appearance_divider" AS ENUM('none', 'hairline', 'soft');
  CREATE TYPE "payload"."enum_prod_hero_appearance_theme_scope" AS ENUM('inherit', 'volt', 'carbon', 'club');
  CREATE TYPE "payload"."enum_prod_story_appearance_space_block_start" AS ENUM('none', 'sm', 'md', 'lg', 'xl');
  CREATE TYPE "payload"."enum_prod_story_appearance_space_block_end" AS ENUM('none', 'sm', 'md', 'lg', 'xl');
  CREATE TYPE "payload"."enum_prod_story_appearance_background" AS ENUM('none', 'surface', 'raised', 'inverse', 'accent');
  CREATE TYPE "payload"."enum_prod_story_appearance_divider" AS ENUM('none', 'hairline', 'soft');
  CREATE TYPE "payload"."enum_prod_story_appearance_hidden_on" AS ENUM('never', 'mobile', 'desktop');
  CREATE TYPE "payload"."enum_prod_story_appearance_theme_scope" AS ENUM('inherit', 'volt', 'carbon', 'club');
  CREATE TYPE "payload"."enum_prod_specs_appearance_space_block_start" AS ENUM('none', 'sm', 'md', 'lg', 'xl');
  CREATE TYPE "payload"."enum_prod_specs_appearance_space_block_end" AS ENUM('none', 'sm', 'md', 'lg', 'xl');
  CREATE TYPE "payload"."enum_prod_specs_appearance_background" AS ENUM('none', 'surface', 'raised', 'inverse', 'accent');
  CREATE TYPE "payload"."enum_prod_specs_appearance_divider" AS ENUM('none', 'hairline', 'soft');
  CREATE TYPE "payload"."enum_prod_specs_appearance_hidden_on" AS ENUM('never', 'mobile', 'desktop');
  CREATE TYPE "payload"."enum_prod_specs_appearance_theme_scope" AS ENUM('inherit', 'volt', 'carbon', 'club');
  CREATE TYPE "payload"."enum_prod_range_appearance_space_block_start" AS ENUM('none', 'sm', 'md', 'lg', 'xl');
  CREATE TYPE "payload"."enum_prod_range_appearance_space_block_end" AS ENUM('none', 'sm', 'md', 'lg', 'xl');
  CREATE TYPE "payload"."enum_prod_range_appearance_background" AS ENUM('none', 'surface', 'raised', 'inverse', 'accent');
  CREATE TYPE "payload"."enum_prod_range_appearance_divider" AS ENUM('none', 'hairline', 'soft');
  CREATE TYPE "payload"."enum_prod_range_appearance_hidden_on" AS ENUM('never', 'mobile', 'desktop');
  CREATE TYPE "payload"."enum_prod_range_appearance_theme_scope" AS ENUM('inherit', 'volt', 'carbon', 'club');
  CREATE TYPE "payload"."enum_templates_blocks_embed_provider" AS ENUM('youtube', 'vimeo');
  CREATE TYPE "payload"."enum_templates_blocks_embed_appearance_space_block_start" AS ENUM('none', 'sm', 'md', 'lg', 'xl');
  CREATE TYPE "payload"."enum_templates_blocks_embed_appearance_space_block_end" AS ENUM('none', 'sm', 'md', 'lg', 'xl');
  CREATE TYPE "payload"."enum_templates_blocks_embed_appearance_background" AS ENUM('none', 'surface', 'raised', 'inverse', 'accent');
  CREATE TYPE "payload"."enum_templates_blocks_embed_appearance_width" AS ENUM('prose', 'content', 'full');
  CREATE TYPE "payload"."enum_templates_blocks_embed_appearance_reveal" AS ENUM('none', 'rise', 'settle');
  CREATE TYPE "payload"."enum_templates_blocks_embed_appearance_theme_scope" AS ENUM('inherit', 'volt', 'carbon', 'club');
  CREATE TYPE "payload"."enum_templates_blocks_waitlist_intent" AS ENUM('waitlist', 'preorder', 'demo');
  CREATE TYPE "payload"."enum_templates_blocks_waitlist_appearance_space_block_start" AS ENUM('none', 'sm', 'md', 'lg', 'xl');
  CREATE TYPE "payload"."enum_templates_blocks_waitlist_appearance_space_block_end" AS ENUM('none', 'sm', 'md', 'lg', 'xl');
  CREATE TYPE "payload"."enum_templates_blocks_waitlist_appearance_background" AS ENUM('none', 'surface', 'raised', 'inverse', 'accent');
  CREATE TYPE "payload"."enum_templates_blocks_waitlist_appearance_align" AS ENUM('start', 'center');
  CREATE TYPE "payload"."enum_templates_blocks_waitlist_appearance_theme_scope" AS ENUM('inherit', 'volt', 'carbon', 'club');
  CREATE TYPE "payload"."enum_prod_lead_appearance_space_block_start" AS ENUM('none', 'sm', 'md', 'lg', 'xl');
  CREATE TYPE "payload"."enum_prod_lead_appearance_space_block_end" AS ENUM('none', 'sm', 'md', 'lg', 'xl');
  CREATE TYPE "payload"."enum_prod_lead_appearance_background" AS ENUM('none', 'surface', 'raised', 'inverse', 'accent');
  CREATE TYPE "payload"."enum_prod_lead_appearance_divider" AS ENUM('none', 'hairline', 'soft');
  CREATE TYPE "payload"."enum_prod_lead_appearance_theme_scope" AS ENUM('inherit', 'volt', 'carbon', 'club');
  CREATE TYPE "payload"."enum_templates_blocks_faq_appearance_space_block_start" AS ENUM('none', 'sm', 'md', 'lg', 'xl');
  CREATE TYPE "payload"."enum_templates_blocks_faq_appearance_space_block_end" AS ENUM('none', 'sm', 'md', 'lg', 'xl');
  CREATE TYPE "payload"."enum_templates_blocks_faq_appearance_background" AS ENUM('none', 'surface', 'raised', 'inverse', 'accent');
  CREATE TYPE "payload"."enum_templates_blocks_faq_appearance_width" AS ENUM('prose', 'content', 'full');
  CREATE TYPE "payload"."enum_templates_blocks_faq_appearance_theme_scope" AS ENUM('inherit', 'volt', 'carbon', 'club');
  CREATE TYPE "payload"."enum_templates_blocks_quote_appearance_space_block_start" AS ENUM('none', 'sm', 'md', 'lg', 'xl');
  CREATE TYPE "payload"."enum_templates_blocks_quote_appearance_space_block_end" AS ENUM('none', 'sm', 'md', 'lg', 'xl');
  CREATE TYPE "payload"."enum_templates_blocks_quote_appearance_background" AS ENUM('none', 'surface', 'raised', 'inverse', 'accent');
  CREATE TYPE "payload"."enum_templates_blocks_quote_appearance_align" AS ENUM('start', 'center');
  CREATE TYPE "payload"."enum_templates_blocks_quote_appearance_theme_scope" AS ENUM('inherit', 'volt', 'carbon', 'club');
  CREATE TYPE "payload"."enum_templates_blocks_cta_band_appearance_space_block_start" AS ENUM('none', 'sm', 'md', 'lg', 'xl');
  CREATE TYPE "payload"."enum_templates_blocks_cta_band_appearance_space_block_end" AS ENUM('none', 'sm', 'md', 'lg', 'xl');
  CREATE TYPE "payload"."enum_templates_blocks_cta_band_appearance_background" AS ENUM('none', 'surface', 'raised', 'inverse', 'accent');
  CREATE TYPE "payload"."enum_templates_blocks_cta_band_appearance_align" AS ENUM('start', 'center');
  CREATE TYPE "payload"."enum_templates_blocks_cta_band_appearance_theme_scope" AS ENUM('inherit', 'volt', 'carbon', 'club');
  CREATE TYPE "payload"."enum_templates_kind" AS ENUM('product');
  CREATE TYPE "payload"."enum__theme_settings_v_version_active_theme" AS ENUM('volt', 'carbon', 'club');
  CREATE TYPE "payload"."enum__markets_v_version_markets_payment_providers_methods" AS ENUM('card', 'bizum', 'klarna', 'sequra', 'clearpay', 'apple_pay', 'google_pay');
  CREATE TYPE "payload"."enum__markets_v_version_markets_payment_providers_provider" AS ENUM('stripe', 'tabby', 'tamara', 'adyen');
  CREATE TYPE "payload"."enum__markets_v_version_markets_market" AS ENUM('es', 'uk', 'ae');
  CREATE TABLE "payload"."templates_blocks_stage_ctas" (
  	"_order" integer NOT NULL,
  	"_parent_id" varchar NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"href" varchar NOT NULL
  );
  
  CREATE TABLE "payload"."templates_blocks_stage_ctas_locales" (
  	"label" varchar NOT NULL,
  	"id" serial PRIMARY KEY NOT NULL,
  	"_locale" "payload"."_locales" NOT NULL,
  	"_parent_id" varchar NOT NULL
  );
  
  CREATE TABLE "payload"."templates_blocks_stage" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"_path" text NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"media_id" integer,
  	"level" "payload"."enum_templates_blocks_stage_level",
  	"appearance_space_block_start" "payload"."enum_templates_blocks_stage_appearance_space_block_start" DEFAULT 'lg',
  	"appearance_space_block_end" "payload"."enum_templates_blocks_stage_appearance_space_block_end" DEFAULT 'lg',
  	"appearance_background" "payload"."enum_templates_blocks_stage_appearance_background" DEFAULT 'none',
  	"appearance_height" "payload"."enum_templates_blocks_stage_appearance_height" DEFAULT 'auto',
  	"appearance_overlay" "payload"."enum_templates_blocks_stage_appearance_overlay" DEFAULT 'none',
  	"appearance_align" "payload"."enum_templates_blocks_stage_appearance_align" DEFAULT 'start',
  	"appearance_width" "payload"."enum_templates_blocks_stage_appearance_width" DEFAULT 'content',
  	"appearance_reveal" "payload"."enum_templates_blocks_stage_appearance_reveal" DEFAULT 'none',
  	"appearance_theme_scope" "payload"."enum_templates_blocks_stage_appearance_theme_scope" DEFAULT 'inherit',
  	"block_name" varchar
  );
  
  CREATE TABLE "payload"."templates_blocks_stage_locales" (
  	"eyebrow" varchar,
  	"heading" varchar NOT NULL,
  	"lead" varchar,
  	"note" varchar,
  	"id" serial PRIMARY KEY NOT NULL,
  	"_locale" "payload"."_locales" NOT NULL,
  	"_parent_id" varchar NOT NULL
  );
  
  CREATE TABLE "payload"."templates_blocks_hero_ctas" (
  	"_order" integer NOT NULL,
  	"_parent_id" varchar NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"href" varchar NOT NULL
  );
  
  CREATE TABLE "payload"."templates_blocks_hero_ctas_locales" (
  	"label" varchar NOT NULL,
  	"id" serial PRIMARY KEY NOT NULL,
  	"_locale" "payload"."_locales" NOT NULL,
  	"_parent_id" varchar NOT NULL
  );
  
  CREATE TABLE "payload"."templates_blocks_hero" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"_path" text NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"level" "payload"."enum_templates_blocks_hero_level",
  	"appearance_space_block_start" "payload"."enum_templates_blocks_hero_appearance_space_block_start" DEFAULT 'lg',
  	"appearance_space_block_end" "payload"."enum_templates_blocks_hero_appearance_space_block_end" DEFAULT 'lg',
  	"appearance_background" "payload"."enum_templates_blocks_hero_appearance_background" DEFAULT 'none',
  	"appearance_align" "payload"."enum_templates_blocks_hero_appearance_align" DEFAULT 'start',
  	"appearance_theme_scope" "payload"."enum_templates_blocks_hero_appearance_theme_scope" DEFAULT 'inherit',
  	"block_name" varchar
  );
  
  CREATE TABLE "payload"."templates_blocks_hero_locales" (
  	"eyebrow" varchar,
  	"heading" varchar NOT NULL,
  	"lead" varchar,
  	"id" serial PRIMARY KEY NOT NULL,
  	"_locale" "payload"."_locales" NOT NULL,
  	"_parent_id" varchar NOT NULL
  );
  
  CREATE TABLE "payload"."templates_blocks_anchor_nav_items" (
  	"_order" integer NOT NULL,
  	"_parent_id" varchar NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"anchor" varchar NOT NULL
  );
  
  CREATE TABLE "payload"."templates_blocks_anchor_nav_items_locales" (
  	"text" varchar NOT NULL,
  	"id" serial PRIMARY KEY NOT NULL,
  	"_locale" "payload"."_locales" NOT NULL,
  	"_parent_id" varchar NOT NULL
  );
  
  CREATE TABLE "payload"."templates_blocks_anchor_nav" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"_path" text NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"appearance_space_block_start" "payload"."enum_templates_blocks_anchor_nav_appearance_space_block_start" DEFAULT 'lg',
  	"appearance_space_block_end" "payload"."enum_templates_blocks_anchor_nav_appearance_space_block_end" DEFAULT 'lg',
  	"appearance_background" "payload"."enum_templates_blocks_anchor_nav_appearance_background" DEFAULT 'none',
  	"appearance_hidden_on" "payload"."enum_templates_blocks_anchor_nav_appearance_hidden_on" DEFAULT 'never',
  	"appearance_theme_scope" "payload"."enum_templates_blocks_anchor_nav_appearance_theme_scope" DEFAULT 'inherit',
  	"block_name" varchar
  );
  
  CREATE TABLE "payload"."templates_blocks_anchor_nav_locales" (
  	"label" varchar,
  	"id" serial PRIMARY KEY NOT NULL,
  	"_locale" "payload"."_locales" NOT NULL,
  	"_parent_id" varchar NOT NULL
  );
  
  CREATE TABLE "payload"."templates_blocks_rich_text" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"_path" text NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"appearance_space_block_start" "payload"."enum_templates_blocks_rich_text_appearance_space_block_start" DEFAULT 'lg',
  	"appearance_space_block_end" "payload"."enum_templates_blocks_rich_text_appearance_space_block_end" DEFAULT 'lg',
  	"appearance_width" "payload"."enum_templates_blocks_rich_text_appearance_width" DEFAULT 'content',
  	"appearance_theme_scope" "payload"."enum_templates_blocks_rich_text_appearance_theme_scope" DEFAULT 'inherit',
  	"block_name" varchar
  );
  
  CREATE TABLE "payload"."templates_blocks_rich_text_locales" (
  	"body" jsonb NOT NULL,
  	"id" serial PRIMARY KEY NOT NULL,
  	"_locale" "payload"."_locales" NOT NULL,
  	"_parent_id" varchar NOT NULL
  );
  
  CREATE TABLE "payload"."templates_blocks_media_text" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"_path" text NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"image_id" integer NOT NULL,
  	"appearance_space_block_start" "payload"."enum_templates_blocks_media_text_appearance_space_block_start" DEFAULT 'lg',
  	"appearance_space_block_end" "payload"."enum_templates_blocks_media_text_appearance_space_block_end" DEFAULT 'lg',
  	"appearance_background" "payload"."enum_templates_blocks_media_text_appearance_background" DEFAULT 'none',
  	"appearance_media_position" "payload"."enum_templates_blocks_media_text_appearance_media_position" DEFAULT 'start',
  	"appearance_theme_scope" "payload"."enum_templates_blocks_media_text_appearance_theme_scope" DEFAULT 'inherit',
  	"block_name" varchar
  );
  
  CREATE TABLE "payload"."templates_blocks_media_text_locales" (
  	"heading" varchar,
  	"body" jsonb NOT NULL,
  	"id" serial PRIMARY KEY NOT NULL,
  	"_locale" "payload"."_locales" NOT NULL,
  	"_parent_id" varchar NOT NULL
  );
  
  CREATE TABLE "payload"."templates_blocks_bento_items" (
  	"_order" integer NOT NULL,
  	"_parent_id" varchar NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"span" "payload"."enum_templates_blocks_bento_items_span",
  	"image_id" integer
  );
  
  CREATE TABLE "payload"."templates_blocks_bento_items_locales" (
  	"eyebrow" varchar,
  	"title" varchar NOT NULL,
  	"body" varchar,
  	"id" serial PRIMARY KEY NOT NULL,
  	"_locale" "payload"."_locales" NOT NULL,
  	"_parent_id" varchar NOT NULL
  );
  
  CREATE TABLE "payload"."templates_blocks_bento" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"_path" text NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"appearance_space_block_start" "payload"."enum_templates_blocks_bento_appearance_space_block_start" DEFAULT 'lg',
  	"appearance_space_block_end" "payload"."enum_templates_blocks_bento_appearance_space_block_end" DEFAULT 'lg',
  	"appearance_background" "payload"."enum_templates_blocks_bento_appearance_background" DEFAULT 'none',
  	"appearance_divider" "payload"."enum_templates_blocks_bento_appearance_divider" DEFAULT 'none',
  	"appearance_reveal" "payload"."enum_templates_blocks_bento_appearance_reveal" DEFAULT 'none',
  	"appearance_hidden_on" "payload"."enum_templates_blocks_bento_appearance_hidden_on" DEFAULT 'never',
  	"appearance_theme_scope" "payload"."enum_templates_blocks_bento_appearance_theme_scope" DEFAULT 'inherit',
  	"block_name" varchar
  );
  
  CREATE TABLE "payload"."templates_blocks_bento_locales" (
  	"heading" varchar,
  	"id" serial PRIMARY KEY NOT NULL,
  	"_locale" "payload"."_locales" NOT NULL,
  	"_parent_id" varchar NOT NULL
  );
  
  CREATE TABLE "payload"."templates_blocks_stat_band_items" (
  	"_order" integer NOT NULL,
  	"_parent_id" varchar NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL
  );
  
  CREATE TABLE "payload"."templates_blocks_stat_band_items_locales" (
  	"value" varchar NOT NULL,
  	"label" varchar NOT NULL,
  	"note" varchar,
  	"id" serial PRIMARY KEY NOT NULL,
  	"_locale" "payload"."_locales" NOT NULL,
  	"_parent_id" varchar NOT NULL
  );
  
  CREATE TABLE "payload"."templates_blocks_stat_band" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"_path" text NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"appearance_space_block_start" "payload"."enum_templates_blocks_stat_band_appearance_space_block_start" DEFAULT 'lg',
  	"appearance_space_block_end" "payload"."enum_templates_blocks_stat_band_appearance_space_block_end" DEFAULT 'lg',
  	"appearance_background" "payload"."enum_templates_blocks_stat_band_appearance_background" DEFAULT 'none',
  	"appearance_align" "payload"."enum_templates_blocks_stat_band_appearance_align" DEFAULT 'start',
  	"appearance_reveal" "payload"."enum_templates_blocks_stat_band_appearance_reveal" DEFAULT 'none',
  	"appearance_theme_scope" "payload"."enum_templates_blocks_stat_band_appearance_theme_scope" DEFAULT 'inherit',
  	"block_name" varchar
  );
  
  CREATE TABLE "payload"."templates_blocks_stat_band_locales" (
  	"heading" varchar,
  	"id" serial PRIMARY KEY NOT NULL,
  	"_locale" "payload"."_locales" NOT NULL,
  	"_parent_id" varchar NOT NULL
  );
  
  CREATE TABLE "payload"."templates_blocks_feature_grid_items" (
  	"_order" integer NOT NULL,
  	"_parent_id" varchar NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL
  );
  
  CREATE TABLE "payload"."templates_blocks_feature_grid_items_locales" (
  	"title" varchar NOT NULL,
  	"body" varchar,
  	"id" serial PRIMARY KEY NOT NULL,
  	"_locale" "payload"."_locales" NOT NULL,
  	"_parent_id" varchar NOT NULL
  );
  
  CREATE TABLE "payload"."templates_blocks_feature_grid" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"_path" text NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"appearance_space_block_start" "payload"."enum_templates_blocks_feature_grid_appearance_space_block_start" DEFAULT 'lg',
  	"appearance_space_block_end" "payload"."enum_templates_blocks_feature_grid_appearance_space_block_end" DEFAULT 'lg',
  	"appearance_background" "payload"."enum_templates_blocks_feature_grid_appearance_background" DEFAULT 'none',
  	"appearance_columns" "payload"."enum_templates_blocks_feature_grid_appearance_columns" DEFAULT '3',
  	"appearance_align" "payload"."enum_templates_blocks_feature_grid_appearance_align" DEFAULT 'start',
  	"appearance_theme_scope" "payload"."enum_templates_blocks_feature_grid_appearance_theme_scope" DEFAULT 'inherit',
  	"block_name" varchar
  );
  
  CREATE TABLE "payload"."templates_blocks_feature_grid_locales" (
  	"heading" varchar NOT NULL,
  	"id" serial PRIMARY KEY NOT NULL,
  	"_locale" "payload"."_locales" NOT NULL,
  	"_parent_id" varchar NOT NULL
  );
  
  CREATE TABLE "payload"."templates_blocks_steps_items" (
  	"_order" integer NOT NULL,
  	"_parent_id" varchar NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL
  );
  
  CREATE TABLE "payload"."templates_blocks_steps_items_locales" (
  	"title" varchar NOT NULL,
  	"body" varchar,
  	"id" serial PRIMARY KEY NOT NULL,
  	"_locale" "payload"."_locales" NOT NULL,
  	"_parent_id" varchar NOT NULL
  );
  
  CREATE TABLE "payload"."templates_blocks_steps" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"_path" text NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"appearance_space_block_start" "payload"."enum_templates_blocks_steps_appearance_space_block_start" DEFAULT 'lg',
  	"appearance_space_block_end" "payload"."enum_templates_blocks_steps_appearance_space_block_end" DEFAULT 'lg',
  	"appearance_background" "payload"."enum_templates_blocks_steps_appearance_background" DEFAULT 'none',
  	"appearance_columns" "payload"."enum_templates_blocks_steps_appearance_columns" DEFAULT '3',
  	"appearance_divider" "payload"."enum_templates_blocks_steps_appearance_divider" DEFAULT 'none',
  	"appearance_reveal" "payload"."enum_templates_blocks_steps_appearance_reveal" DEFAULT 'none',
  	"appearance_hidden_on" "payload"."enum_templates_blocks_steps_appearance_hidden_on" DEFAULT 'never',
  	"appearance_theme_scope" "payload"."enum_templates_blocks_steps_appearance_theme_scope" DEFAULT 'inherit',
  	"block_name" varchar
  );
  
  CREATE TABLE "payload"."templates_blocks_steps_locales" (
  	"heading" varchar,
  	"lead" varchar,
  	"id" serial PRIMARY KEY NOT NULL,
  	"_locale" "payload"."_locales" NOT NULL,
  	"_parent_id" varchar NOT NULL
  );
  
  CREATE TABLE "payload"."templates_blocks_timeline_items" (
  	"_order" integer NOT NULL,
  	"_parent_id" varchar NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"state" "payload"."enum_templates_blocks_timeline_items_state"
  );
  
  CREATE TABLE "payload"."templates_blocks_timeline_items_locales" (
  	"label" varchar NOT NULL,
  	"title" varchar NOT NULL,
  	"body" varchar,
  	"id" serial PRIMARY KEY NOT NULL,
  	"_locale" "payload"."_locales" NOT NULL,
  	"_parent_id" varchar NOT NULL
  );
  
  CREATE TABLE "payload"."templates_blocks_timeline" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"_path" text NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"appearance_space_block_start" "payload"."enum_templates_blocks_timeline_appearance_space_block_start" DEFAULT 'lg',
  	"appearance_space_block_end" "payload"."enum_templates_blocks_timeline_appearance_space_block_end" DEFAULT 'lg',
  	"appearance_background" "payload"."enum_templates_blocks_timeline_appearance_background" DEFAULT 'none',
  	"appearance_reveal" "payload"."enum_templates_blocks_timeline_appearance_reveal" DEFAULT 'none',
  	"appearance_theme_scope" "payload"."enum_templates_blocks_timeline_appearance_theme_scope" DEFAULT 'inherit',
  	"block_name" varchar
  );
  
  CREATE TABLE "payload"."templates_blocks_timeline_locales" (
  	"heading" varchar,
  	"lead" varchar,
  	"id" serial PRIMARY KEY NOT NULL,
  	"_locale" "payload"."_locales" NOT NULL,
  	"_parent_id" varchar NOT NULL
  );
  
  CREATE TABLE "payload"."templates_blocks_hotspots_points" (
  	"_order" integer NOT NULL,
  	"_parent_id" varchar NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"col" "payload"."enum_templates_blocks_hotspots_points_col" NOT NULL,
  	"row" "payload"."enum_templates_blocks_hotspots_points_row" NOT NULL
  );
  
  CREATE TABLE "payload"."templates_blocks_hotspots_points_locales" (
  	"title" varchar NOT NULL,
  	"body" varchar,
  	"id" serial PRIMARY KEY NOT NULL,
  	"_locale" "payload"."_locales" NOT NULL,
  	"_parent_id" varchar NOT NULL
  );
  
  CREATE TABLE "payload"."templates_blocks_hotspots" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"_path" text NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"image_id" integer NOT NULL,
  	"appearance_space_block_start" "payload"."enum_templates_blocks_hotspots_appearance_space_block_start" DEFAULT 'lg',
  	"appearance_space_block_end" "payload"."enum_templates_blocks_hotspots_appearance_space_block_end" DEFAULT 'lg',
  	"appearance_background" "payload"."enum_templates_blocks_hotspots_appearance_background" DEFAULT 'none',
  	"appearance_width" "payload"."enum_templates_blocks_hotspots_appearance_width" DEFAULT 'content',
  	"appearance_reveal" "payload"."enum_templates_blocks_hotspots_appearance_reveal" DEFAULT 'none',
  	"appearance_hidden_on" "payload"."enum_templates_blocks_hotspots_appearance_hidden_on" DEFAULT 'never',
  	"appearance_theme_scope" "payload"."enum_templates_blocks_hotspots_appearance_theme_scope" DEFAULT 'inherit',
  	"block_name" varchar
  );
  
  CREATE TABLE "payload"."templates_blocks_hotspots_locales" (
  	"heading" varchar,
  	"id" serial PRIMARY KEY NOT NULL,
  	"_locale" "payload"."_locales" NOT NULL,
  	"_parent_id" varchar NOT NULL
  );
  
  CREATE TABLE "payload"."templates_blocks_gallery_items" (
  	"_order" integer NOT NULL,
  	"_parent_id" varchar NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"image_id" integer NOT NULL
  );
  
  CREATE TABLE "payload"."templates_blocks_gallery_items_locales" (
  	"caption" varchar,
  	"id" serial PRIMARY KEY NOT NULL,
  	"_locale" "payload"."_locales" NOT NULL,
  	"_parent_id" varchar NOT NULL
  );
  
  CREATE TABLE "payload"."templates_blocks_gallery" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"_path" text NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"appearance_space_block_start" "payload"."enum_templates_blocks_gallery_appearance_space_block_start" DEFAULT 'lg',
  	"appearance_space_block_end" "payload"."enum_templates_blocks_gallery_appearance_space_block_end" DEFAULT 'lg',
  	"appearance_background" "payload"."enum_templates_blocks_gallery_appearance_background" DEFAULT 'none',
  	"appearance_columns" "payload"."enum_templates_blocks_gallery_appearance_columns" DEFAULT '3',
  	"appearance_reveal" "payload"."enum_templates_blocks_gallery_appearance_reveal" DEFAULT 'none',
  	"appearance_theme_scope" "payload"."enum_templates_blocks_gallery_appearance_theme_scope" DEFAULT 'inherit',
  	"block_name" varchar
  );
  
  CREATE TABLE "payload"."templates_blocks_gallery_locales" (
  	"heading" varchar,
  	"id" serial PRIMARY KEY NOT NULL,
  	"_locale" "payload"."_locales" NOT NULL,
  	"_parent_id" varchar NOT NULL
  );
  
  CREATE TABLE "payload"."templates_blocks_spec_table" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"_path" text NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"appearance_space_block_start" "payload"."enum_templates_blocks_spec_table_appearance_space_block_start" DEFAULT 'lg',
  	"appearance_space_block_end" "payload"."enum_templates_blocks_spec_table_appearance_space_block_end" DEFAULT 'lg',
  	"appearance_background" "payload"."enum_templates_blocks_spec_table_appearance_background" DEFAULT 'none',
  	"appearance_divider" "payload"."enum_templates_blocks_spec_table_appearance_divider" DEFAULT 'none',
  	"appearance_reveal" "payload"."enum_templates_blocks_spec_table_appearance_reveal" DEFAULT 'none',
  	"appearance_hidden_on" "payload"."enum_templates_blocks_spec_table_appearance_hidden_on" DEFAULT 'never',
  	"appearance_theme_scope" "payload"."enum_templates_blocks_spec_table_appearance_theme_scope" DEFAULT 'inherit',
  	"block_name" varchar
  );
  
  CREATE TABLE "payload"."templates_blocks_spec_table_locales" (
  	"heading" varchar,
  	"lead" varchar,
  	"id" serial PRIMARY KEY NOT NULL,
  	"_locale" "payload"."_locales" NOT NULL,
  	"_parent_id" varchar NOT NULL
  );
  
  CREATE TABLE "payload"."prod_hero" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"_path" text NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"appearance_space_block_start" "payload"."enum_prod_hero_appearance_space_block_start" DEFAULT 'lg',
  	"appearance_space_block_end" "payload"."enum_prod_hero_appearance_space_block_end" DEFAULT 'lg',
  	"appearance_background" "payload"."enum_prod_hero_appearance_background" DEFAULT 'none',
  	"appearance_divider" "payload"."enum_prod_hero_appearance_divider" DEFAULT 'none',
  	"appearance_theme_scope" "payload"."enum_prod_hero_appearance_theme_scope" DEFAULT 'inherit',
  	"block_name" varchar
  );
  
  CREATE TABLE "payload"."prod_story" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"_path" text NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"appearance_space_block_start" "payload"."enum_prod_story_appearance_space_block_start" DEFAULT 'lg',
  	"appearance_space_block_end" "payload"."enum_prod_story_appearance_space_block_end" DEFAULT 'lg',
  	"appearance_background" "payload"."enum_prod_story_appearance_background" DEFAULT 'none',
  	"appearance_divider" "payload"."enum_prod_story_appearance_divider" DEFAULT 'none',
  	"appearance_hidden_on" "payload"."enum_prod_story_appearance_hidden_on" DEFAULT 'never',
  	"appearance_theme_scope" "payload"."enum_prod_story_appearance_theme_scope" DEFAULT 'inherit',
  	"block_name" varchar
  );
  
  CREATE TABLE "payload"."prod_specs" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"_path" text NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"appearance_space_block_start" "payload"."enum_prod_specs_appearance_space_block_start" DEFAULT 'lg',
  	"appearance_space_block_end" "payload"."enum_prod_specs_appearance_space_block_end" DEFAULT 'lg',
  	"appearance_background" "payload"."enum_prod_specs_appearance_background" DEFAULT 'none',
  	"appearance_divider" "payload"."enum_prod_specs_appearance_divider" DEFAULT 'none',
  	"appearance_hidden_on" "payload"."enum_prod_specs_appearance_hidden_on" DEFAULT 'never',
  	"appearance_theme_scope" "payload"."enum_prod_specs_appearance_theme_scope" DEFAULT 'inherit',
  	"block_name" varchar
  );
  
  CREATE TABLE "payload"."prod_range" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"_path" text NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"appearance_space_block_start" "payload"."enum_prod_range_appearance_space_block_start" DEFAULT 'lg',
  	"appearance_space_block_end" "payload"."enum_prod_range_appearance_space_block_end" DEFAULT 'lg',
  	"appearance_background" "payload"."enum_prod_range_appearance_background" DEFAULT 'none',
  	"appearance_divider" "payload"."enum_prod_range_appearance_divider" DEFAULT 'none',
  	"appearance_hidden_on" "payload"."enum_prod_range_appearance_hidden_on" DEFAULT 'never',
  	"appearance_theme_scope" "payload"."enum_prod_range_appearance_theme_scope" DEFAULT 'inherit',
  	"block_name" varchar
  );
  
  CREATE TABLE "payload"."templates_blocks_embed" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"_path" text NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"provider" "payload"."enum_templates_blocks_embed_provider" NOT NULL,
  	"video_id" varchar NOT NULL,
  	"appearance_space_block_start" "payload"."enum_templates_blocks_embed_appearance_space_block_start" DEFAULT 'lg',
  	"appearance_space_block_end" "payload"."enum_templates_blocks_embed_appearance_space_block_end" DEFAULT 'lg',
  	"appearance_background" "payload"."enum_templates_blocks_embed_appearance_background" DEFAULT 'none',
  	"appearance_width" "payload"."enum_templates_blocks_embed_appearance_width" DEFAULT 'content',
  	"appearance_reveal" "payload"."enum_templates_blocks_embed_appearance_reveal" DEFAULT 'none',
  	"appearance_theme_scope" "payload"."enum_templates_blocks_embed_appearance_theme_scope" DEFAULT 'inherit',
  	"block_name" varchar
  );
  
  CREATE TABLE "payload"."templates_blocks_embed_locales" (
  	"title" varchar NOT NULL,
  	"id" serial PRIMARY KEY NOT NULL,
  	"_locale" "payload"."_locales" NOT NULL,
  	"_parent_id" varchar NOT NULL
  );
  
  CREATE TABLE "payload"."templates_blocks_waitlist" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"_path" text NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"intent" "payload"."enum_templates_blocks_waitlist_intent" NOT NULL,
  	"appearance_space_block_start" "payload"."enum_templates_blocks_waitlist_appearance_space_block_start" DEFAULT 'lg',
  	"appearance_space_block_end" "payload"."enum_templates_blocks_waitlist_appearance_space_block_end" DEFAULT 'lg',
  	"appearance_background" "payload"."enum_templates_blocks_waitlist_appearance_background" DEFAULT 'none',
  	"appearance_align" "payload"."enum_templates_blocks_waitlist_appearance_align" DEFAULT 'start',
  	"appearance_theme_scope" "payload"."enum_templates_blocks_waitlist_appearance_theme_scope" DEFAULT 'inherit',
  	"block_name" varchar
  );
  
  CREATE TABLE "payload"."templates_blocks_waitlist_locales" (
  	"heading" varchar NOT NULL,
  	"body" varchar,
  	"id" serial PRIMARY KEY NOT NULL,
  	"_locale" "payload"."_locales" NOT NULL,
  	"_parent_id" varchar NOT NULL
  );
  
  CREATE TABLE "payload"."prod_lead" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"_path" text NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"appearance_space_block_start" "payload"."enum_prod_lead_appearance_space_block_start" DEFAULT 'lg',
  	"appearance_space_block_end" "payload"."enum_prod_lead_appearance_space_block_end" DEFAULT 'lg',
  	"appearance_background" "payload"."enum_prod_lead_appearance_background" DEFAULT 'none',
  	"appearance_divider" "payload"."enum_prod_lead_appearance_divider" DEFAULT 'none',
  	"appearance_theme_scope" "payload"."enum_prod_lead_appearance_theme_scope" DEFAULT 'inherit',
  	"block_name" varchar
  );
  
  CREATE TABLE "payload"."templates_blocks_faq_items" (
  	"_order" integer NOT NULL,
  	"_parent_id" varchar NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL
  );
  
  CREATE TABLE "payload"."templates_blocks_faq_items_locales" (
  	"question" varchar NOT NULL,
  	"answer" jsonb NOT NULL,
  	"id" serial PRIMARY KEY NOT NULL,
  	"_locale" "payload"."_locales" NOT NULL,
  	"_parent_id" varchar NOT NULL
  );
  
  CREATE TABLE "payload"."templates_blocks_faq" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"_path" text NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"appearance_space_block_start" "payload"."enum_templates_blocks_faq_appearance_space_block_start" DEFAULT 'lg',
  	"appearance_space_block_end" "payload"."enum_templates_blocks_faq_appearance_space_block_end" DEFAULT 'lg',
  	"appearance_background" "payload"."enum_templates_blocks_faq_appearance_background" DEFAULT 'none',
  	"appearance_width" "payload"."enum_templates_blocks_faq_appearance_width" DEFAULT 'content',
  	"appearance_theme_scope" "payload"."enum_templates_blocks_faq_appearance_theme_scope" DEFAULT 'inherit',
  	"block_name" varchar
  );
  
  CREATE TABLE "payload"."templates_blocks_faq_locales" (
  	"heading" varchar NOT NULL,
  	"id" serial PRIMARY KEY NOT NULL,
  	"_locale" "payload"."_locales" NOT NULL,
  	"_parent_id" varchar NOT NULL
  );
  
  CREATE TABLE "payload"."templates_blocks_quote" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"_path" text NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"appearance_space_block_start" "payload"."enum_templates_blocks_quote_appearance_space_block_start" DEFAULT 'lg',
  	"appearance_space_block_end" "payload"."enum_templates_blocks_quote_appearance_space_block_end" DEFAULT 'lg',
  	"appearance_background" "payload"."enum_templates_blocks_quote_appearance_background" DEFAULT 'none',
  	"appearance_align" "payload"."enum_templates_blocks_quote_appearance_align" DEFAULT 'start',
  	"appearance_theme_scope" "payload"."enum_templates_blocks_quote_appearance_theme_scope" DEFAULT 'inherit',
  	"block_name" varchar
  );
  
  CREATE TABLE "payload"."templates_blocks_quote_locales" (
  	"quote" varchar NOT NULL,
  	"author" varchar,
  	"role" varchar,
  	"id" serial PRIMARY KEY NOT NULL,
  	"_locale" "payload"."_locales" NOT NULL,
  	"_parent_id" varchar NOT NULL
  );
  
  CREATE TABLE "payload"."templates_blocks_cta_band_cta" (
  	"_order" integer NOT NULL,
  	"_parent_id" varchar NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"href" varchar NOT NULL
  );
  
  CREATE TABLE "payload"."templates_blocks_cta_band_cta_locales" (
  	"label" varchar NOT NULL,
  	"id" serial PRIMARY KEY NOT NULL,
  	"_locale" "payload"."_locales" NOT NULL,
  	"_parent_id" varchar NOT NULL
  );
  
  CREATE TABLE "payload"."templates_blocks_cta_band" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"_path" text NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"appearance_space_block_start" "payload"."enum_templates_blocks_cta_band_appearance_space_block_start" DEFAULT 'lg',
  	"appearance_space_block_end" "payload"."enum_templates_blocks_cta_band_appearance_space_block_end" DEFAULT 'lg',
  	"appearance_background" "payload"."enum_templates_blocks_cta_band_appearance_background" DEFAULT 'none',
  	"appearance_align" "payload"."enum_templates_blocks_cta_band_appearance_align" DEFAULT 'start',
  	"appearance_theme_scope" "payload"."enum_templates_blocks_cta_band_appearance_theme_scope" DEFAULT 'inherit',
  	"block_name" varchar
  );
  
  CREATE TABLE "payload"."templates_blocks_cta_band_locales" (
  	"heading" varchar NOT NULL,
  	"body" varchar,
  	"id" serial PRIMARY KEY NOT NULL,
  	"_locale" "payload"."_locales" NOT NULL,
  	"_parent_id" varchar NOT NULL
  );
  
  CREATE TABLE "payload"."templates" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"name" varchar NOT NULL,
  	"kind" "payload"."enum_templates_kind" DEFAULT 'product' NOT NULL,
  	"is_default" boolean DEFAULT false,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "payload"."templates_rels" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"order" integer,
  	"parent_id" integer NOT NULL,
  	"path" varchar NOT NULL,
  	"products_id" integer
  );
  
  CREATE TABLE "payload"."_theme_settings_v" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"version_active_theme" "payload"."enum__theme_settings_v_version_active_theme" DEFAULT 'volt' NOT NULL,
  	"version_updated_at" timestamp(3) with time zone,
  	"version_created_at" timestamp(3) with time zone,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "payload"."_markets_v_version_markets_payment_providers_methods" (
  	"order" integer NOT NULL,
  	"parent_id" integer NOT NULL,
  	"value" "payload"."enum__markets_v_version_markets_payment_providers_methods",
  	"id" serial PRIMARY KEY NOT NULL
  );
  
  CREATE TABLE "payload"."_markets_v_version_markets_payment_providers" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"id" serial PRIMARY KEY NOT NULL,
  	"provider" "payload"."enum__markets_v_version_markets_payment_providers_provider" NOT NULL,
  	"enabled" boolean DEFAULT false,
  	"_uuid" varchar
  );
  
  CREATE TABLE "payload"."_markets_v_version_markets" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"id" serial PRIMARY KEY NOT NULL,
  	"market" "payload"."enum__markets_v_version_markets_market" NOT NULL,
  	"enabled" boolean DEFAULT false,
  	"_uuid" varchar
  );
  
  CREATE TABLE "payload"."_markets_v" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"version_updated_at" timestamp(3) with time zone,
  	"version_created_at" timestamp(3) with time zone,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "payload"."_navigation_v_version_header" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"id" serial PRIMARY KEY NOT NULL,
  	"href" varchar NOT NULL,
  	"_uuid" varchar
  );
  
  CREATE TABLE "payload"."_navigation_v_version_header_locales" (
  	"label" varchar NOT NULL,
  	"id" serial PRIMARY KEY NOT NULL,
  	"_locale" "payload"."_locales" NOT NULL,
  	"_parent_id" integer NOT NULL
  );
  
  CREATE TABLE "payload"."_navigation_v_version_footer_groups_links" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"id" serial PRIMARY KEY NOT NULL,
  	"href" varchar NOT NULL,
  	"_uuid" varchar
  );
  
  CREATE TABLE "payload"."_navigation_v_version_footer_groups_links_locales" (
  	"label" varchar NOT NULL,
  	"id" serial PRIMARY KEY NOT NULL,
  	"_locale" "payload"."_locales" NOT NULL,
  	"_parent_id" integer NOT NULL
  );
  
  CREATE TABLE "payload"."_navigation_v_version_footer_groups" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"id" serial PRIMARY KEY NOT NULL,
  	"_uuid" varchar
  );
  
  CREATE TABLE "payload"."_navigation_v_version_footer_groups_locales" (
  	"label" varchar NOT NULL,
  	"id" serial PRIMARY KEY NOT NULL,
  	"_locale" "payload"."_locales" NOT NULL,
  	"_parent_id" integer NOT NULL
  );
  
  CREATE TABLE "payload"."_navigation_v_version_footer" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"id" serial PRIMARY KEY NOT NULL,
  	"href" varchar NOT NULL,
  	"_uuid" varchar
  );
  
  CREATE TABLE "payload"."_navigation_v_version_footer_locales" (
  	"label" varchar NOT NULL,
  	"id" serial PRIMARY KEY NOT NULL,
  	"_locale" "payload"."_locales" NOT NULL,
  	"_parent_id" integer NOT NULL
  );
  
  CREATE TABLE "payload"."_navigation_v" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"version_header_cta_href" varchar,
  	"version_updated_at" timestamp(3) with time zone,
  	"version_created_at" timestamp(3) with time zone,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "payload"."_navigation_v_locales" (
  	"version_header_cta_label" varchar,
  	"id" serial PRIMARY KEY NOT NULL,
  	"_locale" "payload"."_locales" NOT NULL,
  	"_parent_id" integer NOT NULL
  );
  
  DROP INDEX "payload"."pages_slug_idx";
  DROP INDEX "payload"."redirects_from_idx";
  ALTER TABLE "payload"."media" ADD COLUMN "deleted_at" timestamp(3) with time zone;
  ALTER TABLE "payload"."pages" ADD COLUMN "deleted_at" timestamp(3) with time zone;
  ALTER TABLE "payload"."_pages_v" ADD COLUMN "version_deleted_at" timestamp(3) with time zone;
  ALTER TABLE "payload"."redirects" ADD COLUMN "deleted_at" timestamp(3) with time zone;
  ALTER TABLE "payload"."products" ADD COLUMN "template_id" integer;
  ALTER TABLE "payload"."_products_v" ADD COLUMN "version_template_id" integer;
  ALTER TABLE "payload"."payload_locked_documents_rels" ADD COLUMN "templates_id" integer;
  ALTER TABLE "payload"."templates_blocks_stage_ctas" ADD CONSTRAINT "templates_blocks_stage_ctas_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "payload"."templates_blocks_stage"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload"."templates_blocks_stage_ctas_locales" ADD CONSTRAINT "templates_blocks_stage_ctas_locales_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "payload"."templates_blocks_stage_ctas"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload"."templates_blocks_stage" ADD CONSTRAINT "templates_blocks_stage_media_id_media_id_fk" FOREIGN KEY ("media_id") REFERENCES "payload"."media"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "payload"."templates_blocks_stage" ADD CONSTRAINT "templates_blocks_stage_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "payload"."templates"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload"."templates_blocks_stage_locales" ADD CONSTRAINT "templates_blocks_stage_locales_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "payload"."templates_blocks_stage"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload"."templates_blocks_hero_ctas" ADD CONSTRAINT "templates_blocks_hero_ctas_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "payload"."templates_blocks_hero"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload"."templates_blocks_hero_ctas_locales" ADD CONSTRAINT "templates_blocks_hero_ctas_locales_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "payload"."templates_blocks_hero_ctas"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload"."templates_blocks_hero" ADD CONSTRAINT "templates_blocks_hero_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "payload"."templates"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload"."templates_blocks_hero_locales" ADD CONSTRAINT "templates_blocks_hero_locales_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "payload"."templates_blocks_hero"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload"."templates_blocks_anchor_nav_items" ADD CONSTRAINT "templates_blocks_anchor_nav_items_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "payload"."templates_blocks_anchor_nav"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload"."templates_blocks_anchor_nav_items_locales" ADD CONSTRAINT "templates_blocks_anchor_nav_items_locales_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "payload"."templates_blocks_anchor_nav_items"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload"."templates_blocks_anchor_nav" ADD CONSTRAINT "templates_blocks_anchor_nav_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "payload"."templates"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload"."templates_blocks_anchor_nav_locales" ADD CONSTRAINT "templates_blocks_anchor_nav_locales_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "payload"."templates_blocks_anchor_nav"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload"."templates_blocks_rich_text" ADD CONSTRAINT "templates_blocks_rich_text_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "payload"."templates"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload"."templates_blocks_rich_text_locales" ADD CONSTRAINT "templates_blocks_rich_text_locales_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "payload"."templates_blocks_rich_text"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload"."templates_blocks_media_text" ADD CONSTRAINT "templates_blocks_media_text_image_id_media_id_fk" FOREIGN KEY ("image_id") REFERENCES "payload"."media"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "payload"."templates_blocks_media_text" ADD CONSTRAINT "templates_blocks_media_text_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "payload"."templates"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload"."templates_blocks_media_text_locales" ADD CONSTRAINT "templates_blocks_media_text_locales_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "payload"."templates_blocks_media_text"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload"."templates_blocks_bento_items" ADD CONSTRAINT "templates_blocks_bento_items_image_id_media_id_fk" FOREIGN KEY ("image_id") REFERENCES "payload"."media"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "payload"."templates_blocks_bento_items" ADD CONSTRAINT "templates_blocks_bento_items_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "payload"."templates_blocks_bento"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload"."templates_blocks_bento_items_locales" ADD CONSTRAINT "templates_blocks_bento_items_locales_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "payload"."templates_blocks_bento_items"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload"."templates_blocks_bento" ADD CONSTRAINT "templates_blocks_bento_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "payload"."templates"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload"."templates_blocks_bento_locales" ADD CONSTRAINT "templates_blocks_bento_locales_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "payload"."templates_blocks_bento"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload"."templates_blocks_stat_band_items" ADD CONSTRAINT "templates_blocks_stat_band_items_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "payload"."templates_blocks_stat_band"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload"."templates_blocks_stat_band_items_locales" ADD CONSTRAINT "templates_blocks_stat_band_items_locales_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "payload"."templates_blocks_stat_band_items"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload"."templates_blocks_stat_band" ADD CONSTRAINT "templates_blocks_stat_band_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "payload"."templates"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload"."templates_blocks_stat_band_locales" ADD CONSTRAINT "templates_blocks_stat_band_locales_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "payload"."templates_blocks_stat_band"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload"."templates_blocks_feature_grid_items" ADD CONSTRAINT "templates_blocks_feature_grid_items_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "payload"."templates_blocks_feature_grid"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload"."templates_blocks_feature_grid_items_locales" ADD CONSTRAINT "templates_blocks_feature_grid_items_locales_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "payload"."templates_blocks_feature_grid_items"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload"."templates_blocks_feature_grid" ADD CONSTRAINT "templates_blocks_feature_grid_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "payload"."templates"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload"."templates_blocks_feature_grid_locales" ADD CONSTRAINT "templates_blocks_feature_grid_locales_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "payload"."templates_blocks_feature_grid"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload"."templates_blocks_steps_items" ADD CONSTRAINT "templates_blocks_steps_items_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "payload"."templates_blocks_steps"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload"."templates_blocks_steps_items_locales" ADD CONSTRAINT "templates_blocks_steps_items_locales_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "payload"."templates_blocks_steps_items"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload"."templates_blocks_steps" ADD CONSTRAINT "templates_blocks_steps_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "payload"."templates"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload"."templates_blocks_steps_locales" ADD CONSTRAINT "templates_blocks_steps_locales_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "payload"."templates_blocks_steps"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload"."templates_blocks_timeline_items" ADD CONSTRAINT "templates_blocks_timeline_items_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "payload"."templates_blocks_timeline"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload"."templates_blocks_timeline_items_locales" ADD CONSTRAINT "templates_blocks_timeline_items_locales_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "payload"."templates_blocks_timeline_items"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload"."templates_blocks_timeline" ADD CONSTRAINT "templates_blocks_timeline_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "payload"."templates"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload"."templates_blocks_timeline_locales" ADD CONSTRAINT "templates_blocks_timeline_locales_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "payload"."templates_blocks_timeline"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload"."templates_blocks_hotspots_points" ADD CONSTRAINT "templates_blocks_hotspots_points_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "payload"."templates_blocks_hotspots"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload"."templates_blocks_hotspots_points_locales" ADD CONSTRAINT "templates_blocks_hotspots_points_locales_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "payload"."templates_blocks_hotspots_points"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload"."templates_blocks_hotspots" ADD CONSTRAINT "templates_blocks_hotspots_image_id_media_id_fk" FOREIGN KEY ("image_id") REFERENCES "payload"."media"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "payload"."templates_blocks_hotspots" ADD CONSTRAINT "templates_blocks_hotspots_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "payload"."templates"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload"."templates_blocks_hotspots_locales" ADD CONSTRAINT "templates_blocks_hotspots_locales_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "payload"."templates_blocks_hotspots"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload"."templates_blocks_gallery_items" ADD CONSTRAINT "templates_blocks_gallery_items_image_id_media_id_fk" FOREIGN KEY ("image_id") REFERENCES "payload"."media"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "payload"."templates_blocks_gallery_items" ADD CONSTRAINT "templates_blocks_gallery_items_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "payload"."templates_blocks_gallery"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload"."templates_blocks_gallery_items_locales" ADD CONSTRAINT "templates_blocks_gallery_items_locales_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "payload"."templates_blocks_gallery_items"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload"."templates_blocks_gallery" ADD CONSTRAINT "templates_blocks_gallery_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "payload"."templates"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload"."templates_blocks_gallery_locales" ADD CONSTRAINT "templates_blocks_gallery_locales_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "payload"."templates_blocks_gallery"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload"."templates_blocks_spec_table" ADD CONSTRAINT "templates_blocks_spec_table_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "payload"."templates"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload"."templates_blocks_spec_table_locales" ADD CONSTRAINT "templates_blocks_spec_table_locales_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "payload"."templates_blocks_spec_table"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload"."prod_hero" ADD CONSTRAINT "prod_hero_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "payload"."templates"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload"."prod_story" ADD CONSTRAINT "prod_story_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "payload"."templates"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload"."prod_specs" ADD CONSTRAINT "prod_specs_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "payload"."templates"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload"."prod_range" ADD CONSTRAINT "prod_range_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "payload"."templates"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload"."templates_blocks_embed" ADD CONSTRAINT "templates_blocks_embed_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "payload"."templates"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload"."templates_blocks_embed_locales" ADD CONSTRAINT "templates_blocks_embed_locales_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "payload"."templates_blocks_embed"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload"."templates_blocks_waitlist" ADD CONSTRAINT "templates_blocks_waitlist_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "payload"."templates"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload"."templates_blocks_waitlist_locales" ADD CONSTRAINT "templates_blocks_waitlist_locales_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "payload"."templates_blocks_waitlist"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload"."prod_lead" ADD CONSTRAINT "prod_lead_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "payload"."templates"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload"."templates_blocks_faq_items" ADD CONSTRAINT "templates_blocks_faq_items_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "payload"."templates_blocks_faq"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload"."templates_blocks_faq_items_locales" ADD CONSTRAINT "templates_blocks_faq_items_locales_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "payload"."templates_blocks_faq_items"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload"."templates_blocks_faq" ADD CONSTRAINT "templates_blocks_faq_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "payload"."templates"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload"."templates_blocks_faq_locales" ADD CONSTRAINT "templates_blocks_faq_locales_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "payload"."templates_blocks_faq"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload"."templates_blocks_quote" ADD CONSTRAINT "templates_blocks_quote_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "payload"."templates"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload"."templates_blocks_quote_locales" ADD CONSTRAINT "templates_blocks_quote_locales_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "payload"."templates_blocks_quote"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload"."templates_blocks_cta_band_cta" ADD CONSTRAINT "templates_blocks_cta_band_cta_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "payload"."templates_blocks_cta_band"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload"."templates_blocks_cta_band_cta_locales" ADD CONSTRAINT "templates_blocks_cta_band_cta_locales_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "payload"."templates_blocks_cta_band_cta"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload"."templates_blocks_cta_band" ADD CONSTRAINT "templates_blocks_cta_band_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "payload"."templates"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload"."templates_blocks_cta_band_locales" ADD CONSTRAINT "templates_blocks_cta_band_locales_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "payload"."templates_blocks_cta_band"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload"."templates_rels" ADD CONSTRAINT "templates_rels_parent_fk" FOREIGN KEY ("parent_id") REFERENCES "payload"."templates"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload"."templates_rels" ADD CONSTRAINT "templates_rels_products_fk" FOREIGN KEY ("products_id") REFERENCES "payload"."products"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload"."_markets_v_version_markets_payment_providers_methods" ADD CONSTRAINT "_markets_v_version_markets_payment_providers_methods_parent_fk" FOREIGN KEY ("parent_id") REFERENCES "payload"."_markets_v_version_markets_payment_providers"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload"."_markets_v_version_markets_payment_providers" ADD CONSTRAINT "_markets_v_version_markets_payment_providers_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "payload"."_markets_v_version_markets"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload"."_markets_v_version_markets" ADD CONSTRAINT "_markets_v_version_markets_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "payload"."_markets_v"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload"."_navigation_v_version_header" ADD CONSTRAINT "_navigation_v_version_header_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "payload"."_navigation_v"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload"."_navigation_v_version_header_locales" ADD CONSTRAINT "_navigation_v_version_header_locales_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "payload"."_navigation_v_version_header"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload"."_navigation_v_version_footer_groups_links" ADD CONSTRAINT "_navigation_v_version_footer_groups_links_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "payload"."_navigation_v_version_footer_groups"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload"."_navigation_v_version_footer_groups_links_locales" ADD CONSTRAINT "_navigation_v_version_footer_groups_links_locales_parent__fk" FOREIGN KEY ("_parent_id") REFERENCES "payload"."_navigation_v_version_footer_groups_links"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload"."_navigation_v_version_footer_groups" ADD CONSTRAINT "_navigation_v_version_footer_groups_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "payload"."_navigation_v"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload"."_navigation_v_version_footer_groups_locales" ADD CONSTRAINT "_navigation_v_version_footer_groups_locales_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "payload"."_navigation_v_version_footer_groups"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload"."_navigation_v_version_footer" ADD CONSTRAINT "_navigation_v_version_footer_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "payload"."_navigation_v"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload"."_navigation_v_version_footer_locales" ADD CONSTRAINT "_navigation_v_version_footer_locales_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "payload"."_navigation_v_version_footer"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload"."_navigation_v_locales" ADD CONSTRAINT "_navigation_v_locales_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "payload"."_navigation_v"("id") ON DELETE cascade ON UPDATE no action;
  CREATE INDEX "templates_blocks_stage_ctas_order_idx" ON "payload"."templates_blocks_stage_ctas" USING btree ("_order");
  CREATE INDEX "templates_blocks_stage_ctas_parent_id_idx" ON "payload"."templates_blocks_stage_ctas" USING btree ("_parent_id");
  CREATE UNIQUE INDEX "templates_blocks_stage_ctas_locales_locale_parent_id_unique" ON "payload"."templates_blocks_stage_ctas_locales" USING btree ("_locale","_parent_id");
  CREATE INDEX "templates_blocks_stage_order_idx" ON "payload"."templates_blocks_stage" USING btree ("_order");
  CREATE INDEX "templates_blocks_stage_parent_id_idx" ON "payload"."templates_blocks_stage" USING btree ("_parent_id");
  CREATE INDEX "templates_blocks_stage_path_idx" ON "payload"."templates_blocks_stage" USING btree ("_path");
  CREATE INDEX "templates_blocks_stage_media_idx" ON "payload"."templates_blocks_stage" USING btree ("media_id");
  CREATE UNIQUE INDEX "templates_blocks_stage_locales_locale_parent_id_unique" ON "payload"."templates_blocks_stage_locales" USING btree ("_locale","_parent_id");
  CREATE INDEX "templates_blocks_hero_ctas_order_idx" ON "payload"."templates_blocks_hero_ctas" USING btree ("_order");
  CREATE INDEX "templates_blocks_hero_ctas_parent_id_idx" ON "payload"."templates_blocks_hero_ctas" USING btree ("_parent_id");
  CREATE UNIQUE INDEX "templates_blocks_hero_ctas_locales_locale_parent_id_unique" ON "payload"."templates_blocks_hero_ctas_locales" USING btree ("_locale","_parent_id");
  CREATE INDEX "templates_blocks_hero_order_idx" ON "payload"."templates_blocks_hero" USING btree ("_order");
  CREATE INDEX "templates_blocks_hero_parent_id_idx" ON "payload"."templates_blocks_hero" USING btree ("_parent_id");
  CREATE INDEX "templates_blocks_hero_path_idx" ON "payload"."templates_blocks_hero" USING btree ("_path");
  CREATE UNIQUE INDEX "templates_blocks_hero_locales_locale_parent_id_unique" ON "payload"."templates_blocks_hero_locales" USING btree ("_locale","_parent_id");
  CREATE INDEX "templates_blocks_anchor_nav_items_order_idx" ON "payload"."templates_blocks_anchor_nav_items" USING btree ("_order");
  CREATE INDEX "templates_blocks_anchor_nav_items_parent_id_idx" ON "payload"."templates_blocks_anchor_nav_items" USING btree ("_parent_id");
  CREATE UNIQUE INDEX "templates_blocks_anchor_nav_items_locales_locale_parent_id_u" ON "payload"."templates_blocks_anchor_nav_items_locales" USING btree ("_locale","_parent_id");
  CREATE INDEX "templates_blocks_anchor_nav_order_idx" ON "payload"."templates_blocks_anchor_nav" USING btree ("_order");
  CREATE INDEX "templates_blocks_anchor_nav_parent_id_idx" ON "payload"."templates_blocks_anchor_nav" USING btree ("_parent_id");
  CREATE INDEX "templates_blocks_anchor_nav_path_idx" ON "payload"."templates_blocks_anchor_nav" USING btree ("_path");
  CREATE UNIQUE INDEX "templates_blocks_anchor_nav_locales_locale_parent_id_unique" ON "payload"."templates_blocks_anchor_nav_locales" USING btree ("_locale","_parent_id");
  CREATE INDEX "templates_blocks_rich_text_order_idx" ON "payload"."templates_blocks_rich_text" USING btree ("_order");
  CREATE INDEX "templates_blocks_rich_text_parent_id_idx" ON "payload"."templates_blocks_rich_text" USING btree ("_parent_id");
  CREATE INDEX "templates_blocks_rich_text_path_idx" ON "payload"."templates_blocks_rich_text" USING btree ("_path");
  CREATE UNIQUE INDEX "templates_blocks_rich_text_locales_locale_parent_id_unique" ON "payload"."templates_blocks_rich_text_locales" USING btree ("_locale","_parent_id");
  CREATE INDEX "templates_blocks_media_text_order_idx" ON "payload"."templates_blocks_media_text" USING btree ("_order");
  CREATE INDEX "templates_blocks_media_text_parent_id_idx" ON "payload"."templates_blocks_media_text" USING btree ("_parent_id");
  CREATE INDEX "templates_blocks_media_text_path_idx" ON "payload"."templates_blocks_media_text" USING btree ("_path");
  CREATE INDEX "templates_blocks_media_text_image_idx" ON "payload"."templates_blocks_media_text" USING btree ("image_id");
  CREATE UNIQUE INDEX "templates_blocks_media_text_locales_locale_parent_id_unique" ON "payload"."templates_blocks_media_text_locales" USING btree ("_locale","_parent_id");
  CREATE INDEX "templates_blocks_bento_items_order_idx" ON "payload"."templates_blocks_bento_items" USING btree ("_order");
  CREATE INDEX "templates_blocks_bento_items_parent_id_idx" ON "payload"."templates_blocks_bento_items" USING btree ("_parent_id");
  CREATE INDEX "templates_blocks_bento_items_image_idx" ON "payload"."templates_blocks_bento_items" USING btree ("image_id");
  CREATE UNIQUE INDEX "templates_blocks_bento_items_locales_locale_parent_id_unique" ON "payload"."templates_blocks_bento_items_locales" USING btree ("_locale","_parent_id");
  CREATE INDEX "templates_blocks_bento_order_idx" ON "payload"."templates_blocks_bento" USING btree ("_order");
  CREATE INDEX "templates_blocks_bento_parent_id_idx" ON "payload"."templates_blocks_bento" USING btree ("_parent_id");
  CREATE INDEX "templates_blocks_bento_path_idx" ON "payload"."templates_blocks_bento" USING btree ("_path");
  CREATE UNIQUE INDEX "templates_blocks_bento_locales_locale_parent_id_unique" ON "payload"."templates_blocks_bento_locales" USING btree ("_locale","_parent_id");
  CREATE INDEX "templates_blocks_stat_band_items_order_idx" ON "payload"."templates_blocks_stat_band_items" USING btree ("_order");
  CREATE INDEX "templates_blocks_stat_band_items_parent_id_idx" ON "payload"."templates_blocks_stat_band_items" USING btree ("_parent_id");
  CREATE UNIQUE INDEX "templates_blocks_stat_band_items_locales_locale_parent_id_un" ON "payload"."templates_blocks_stat_band_items_locales" USING btree ("_locale","_parent_id");
  CREATE INDEX "templates_blocks_stat_band_order_idx" ON "payload"."templates_blocks_stat_band" USING btree ("_order");
  CREATE INDEX "templates_blocks_stat_band_parent_id_idx" ON "payload"."templates_blocks_stat_band" USING btree ("_parent_id");
  CREATE INDEX "templates_blocks_stat_band_path_idx" ON "payload"."templates_blocks_stat_band" USING btree ("_path");
  CREATE UNIQUE INDEX "templates_blocks_stat_band_locales_locale_parent_id_unique" ON "payload"."templates_blocks_stat_band_locales" USING btree ("_locale","_parent_id");
  CREATE INDEX "templates_blocks_feature_grid_items_order_idx" ON "payload"."templates_blocks_feature_grid_items" USING btree ("_order");
  CREATE INDEX "templates_blocks_feature_grid_items_parent_id_idx" ON "payload"."templates_blocks_feature_grid_items" USING btree ("_parent_id");
  CREATE UNIQUE INDEX "templates_blocks_feature_grid_items_locales_locale_parent_id" ON "payload"."templates_blocks_feature_grid_items_locales" USING btree ("_locale","_parent_id");
  CREATE INDEX "templates_blocks_feature_grid_order_idx" ON "payload"."templates_blocks_feature_grid" USING btree ("_order");
  CREATE INDEX "templates_blocks_feature_grid_parent_id_idx" ON "payload"."templates_blocks_feature_grid" USING btree ("_parent_id");
  CREATE INDEX "templates_blocks_feature_grid_path_idx" ON "payload"."templates_blocks_feature_grid" USING btree ("_path");
  CREATE UNIQUE INDEX "templates_blocks_feature_grid_locales_locale_parent_id_uniqu" ON "payload"."templates_blocks_feature_grid_locales" USING btree ("_locale","_parent_id");
  CREATE INDEX "templates_blocks_steps_items_order_idx" ON "payload"."templates_blocks_steps_items" USING btree ("_order");
  CREATE INDEX "templates_blocks_steps_items_parent_id_idx" ON "payload"."templates_blocks_steps_items" USING btree ("_parent_id");
  CREATE UNIQUE INDEX "templates_blocks_steps_items_locales_locale_parent_id_unique" ON "payload"."templates_blocks_steps_items_locales" USING btree ("_locale","_parent_id");
  CREATE INDEX "templates_blocks_steps_order_idx" ON "payload"."templates_blocks_steps" USING btree ("_order");
  CREATE INDEX "templates_blocks_steps_parent_id_idx" ON "payload"."templates_blocks_steps" USING btree ("_parent_id");
  CREATE INDEX "templates_blocks_steps_path_idx" ON "payload"."templates_blocks_steps" USING btree ("_path");
  CREATE UNIQUE INDEX "templates_blocks_steps_locales_locale_parent_id_unique" ON "payload"."templates_blocks_steps_locales" USING btree ("_locale","_parent_id");
  CREATE INDEX "templates_blocks_timeline_items_order_idx" ON "payload"."templates_blocks_timeline_items" USING btree ("_order");
  CREATE INDEX "templates_blocks_timeline_items_parent_id_idx" ON "payload"."templates_blocks_timeline_items" USING btree ("_parent_id");
  CREATE UNIQUE INDEX "templates_blocks_timeline_items_locales_locale_parent_id_uni" ON "payload"."templates_blocks_timeline_items_locales" USING btree ("_locale","_parent_id");
  CREATE INDEX "templates_blocks_timeline_order_idx" ON "payload"."templates_blocks_timeline" USING btree ("_order");
  CREATE INDEX "templates_blocks_timeline_parent_id_idx" ON "payload"."templates_blocks_timeline" USING btree ("_parent_id");
  CREATE INDEX "templates_blocks_timeline_path_idx" ON "payload"."templates_blocks_timeline" USING btree ("_path");
  CREATE UNIQUE INDEX "templates_blocks_timeline_locales_locale_parent_id_unique" ON "payload"."templates_blocks_timeline_locales" USING btree ("_locale","_parent_id");
  CREATE INDEX "templates_blocks_hotspots_points_order_idx" ON "payload"."templates_blocks_hotspots_points" USING btree ("_order");
  CREATE INDEX "templates_blocks_hotspots_points_parent_id_idx" ON "payload"."templates_blocks_hotspots_points" USING btree ("_parent_id");
  CREATE UNIQUE INDEX "templates_blocks_hotspots_points_locales_locale_parent_id_un" ON "payload"."templates_blocks_hotspots_points_locales" USING btree ("_locale","_parent_id");
  CREATE INDEX "templates_blocks_hotspots_order_idx" ON "payload"."templates_blocks_hotspots" USING btree ("_order");
  CREATE INDEX "templates_blocks_hotspots_parent_id_idx" ON "payload"."templates_blocks_hotspots" USING btree ("_parent_id");
  CREATE INDEX "templates_blocks_hotspots_path_idx" ON "payload"."templates_blocks_hotspots" USING btree ("_path");
  CREATE INDEX "templates_blocks_hotspots_image_idx" ON "payload"."templates_blocks_hotspots" USING btree ("image_id");
  CREATE UNIQUE INDEX "templates_blocks_hotspots_locales_locale_parent_id_unique" ON "payload"."templates_blocks_hotspots_locales" USING btree ("_locale","_parent_id");
  CREATE INDEX "templates_blocks_gallery_items_order_idx" ON "payload"."templates_blocks_gallery_items" USING btree ("_order");
  CREATE INDEX "templates_blocks_gallery_items_parent_id_idx" ON "payload"."templates_blocks_gallery_items" USING btree ("_parent_id");
  CREATE INDEX "templates_blocks_gallery_items_image_idx" ON "payload"."templates_blocks_gallery_items" USING btree ("image_id");
  CREATE UNIQUE INDEX "templates_blocks_gallery_items_locales_locale_parent_id_uniq" ON "payload"."templates_blocks_gallery_items_locales" USING btree ("_locale","_parent_id");
  CREATE INDEX "templates_blocks_gallery_order_idx" ON "payload"."templates_blocks_gallery" USING btree ("_order");
  CREATE INDEX "templates_blocks_gallery_parent_id_idx" ON "payload"."templates_blocks_gallery" USING btree ("_parent_id");
  CREATE INDEX "templates_blocks_gallery_path_idx" ON "payload"."templates_blocks_gallery" USING btree ("_path");
  CREATE UNIQUE INDEX "templates_blocks_gallery_locales_locale_parent_id_unique" ON "payload"."templates_blocks_gallery_locales" USING btree ("_locale","_parent_id");
  CREATE INDEX "templates_blocks_spec_table_order_idx" ON "payload"."templates_blocks_spec_table" USING btree ("_order");
  CREATE INDEX "templates_blocks_spec_table_parent_id_idx" ON "payload"."templates_blocks_spec_table" USING btree ("_parent_id");
  CREATE INDEX "templates_blocks_spec_table_path_idx" ON "payload"."templates_blocks_spec_table" USING btree ("_path");
  CREATE UNIQUE INDEX "templates_blocks_spec_table_locales_locale_parent_id_unique" ON "payload"."templates_blocks_spec_table_locales" USING btree ("_locale","_parent_id");
  CREATE INDEX "prod_hero_order_idx" ON "payload"."prod_hero" USING btree ("_order");
  CREATE INDEX "prod_hero_parent_id_idx" ON "payload"."prod_hero" USING btree ("_parent_id");
  CREATE INDEX "prod_hero_path_idx" ON "payload"."prod_hero" USING btree ("_path");
  CREATE INDEX "prod_story_order_idx" ON "payload"."prod_story" USING btree ("_order");
  CREATE INDEX "prod_story_parent_id_idx" ON "payload"."prod_story" USING btree ("_parent_id");
  CREATE INDEX "prod_story_path_idx" ON "payload"."prod_story" USING btree ("_path");
  CREATE INDEX "prod_specs_order_idx" ON "payload"."prod_specs" USING btree ("_order");
  CREATE INDEX "prod_specs_parent_id_idx" ON "payload"."prod_specs" USING btree ("_parent_id");
  CREATE INDEX "prod_specs_path_idx" ON "payload"."prod_specs" USING btree ("_path");
  CREATE INDEX "prod_range_order_idx" ON "payload"."prod_range" USING btree ("_order");
  CREATE INDEX "prod_range_parent_id_idx" ON "payload"."prod_range" USING btree ("_parent_id");
  CREATE INDEX "prod_range_path_idx" ON "payload"."prod_range" USING btree ("_path");
  CREATE INDEX "templates_blocks_embed_order_idx" ON "payload"."templates_blocks_embed" USING btree ("_order");
  CREATE INDEX "templates_blocks_embed_parent_id_idx" ON "payload"."templates_blocks_embed" USING btree ("_parent_id");
  CREATE INDEX "templates_blocks_embed_path_idx" ON "payload"."templates_blocks_embed" USING btree ("_path");
  CREATE UNIQUE INDEX "templates_blocks_embed_locales_locale_parent_id_unique" ON "payload"."templates_blocks_embed_locales" USING btree ("_locale","_parent_id");
  CREATE INDEX "templates_blocks_waitlist_order_idx" ON "payload"."templates_blocks_waitlist" USING btree ("_order");
  CREATE INDEX "templates_blocks_waitlist_parent_id_idx" ON "payload"."templates_blocks_waitlist" USING btree ("_parent_id");
  CREATE INDEX "templates_blocks_waitlist_path_idx" ON "payload"."templates_blocks_waitlist" USING btree ("_path");
  CREATE UNIQUE INDEX "templates_blocks_waitlist_locales_locale_parent_id_unique" ON "payload"."templates_blocks_waitlist_locales" USING btree ("_locale","_parent_id");
  CREATE INDEX "prod_lead_order_idx" ON "payload"."prod_lead" USING btree ("_order");
  CREATE INDEX "prod_lead_parent_id_idx" ON "payload"."prod_lead" USING btree ("_parent_id");
  CREATE INDEX "prod_lead_path_idx" ON "payload"."prod_lead" USING btree ("_path");
  CREATE INDEX "templates_blocks_faq_items_order_idx" ON "payload"."templates_blocks_faq_items" USING btree ("_order");
  CREATE INDEX "templates_blocks_faq_items_parent_id_idx" ON "payload"."templates_blocks_faq_items" USING btree ("_parent_id");
  CREATE UNIQUE INDEX "templates_blocks_faq_items_locales_locale_parent_id_unique" ON "payload"."templates_blocks_faq_items_locales" USING btree ("_locale","_parent_id");
  CREATE INDEX "templates_blocks_faq_order_idx" ON "payload"."templates_blocks_faq" USING btree ("_order");
  CREATE INDEX "templates_blocks_faq_parent_id_idx" ON "payload"."templates_blocks_faq" USING btree ("_parent_id");
  CREATE INDEX "templates_blocks_faq_path_idx" ON "payload"."templates_blocks_faq" USING btree ("_path");
  CREATE UNIQUE INDEX "templates_blocks_faq_locales_locale_parent_id_unique" ON "payload"."templates_blocks_faq_locales" USING btree ("_locale","_parent_id");
  CREATE INDEX "templates_blocks_quote_order_idx" ON "payload"."templates_blocks_quote" USING btree ("_order");
  CREATE INDEX "templates_blocks_quote_parent_id_idx" ON "payload"."templates_blocks_quote" USING btree ("_parent_id");
  CREATE INDEX "templates_blocks_quote_path_idx" ON "payload"."templates_blocks_quote" USING btree ("_path");
  CREATE UNIQUE INDEX "templates_blocks_quote_locales_locale_parent_id_unique" ON "payload"."templates_blocks_quote_locales" USING btree ("_locale","_parent_id");
  CREATE INDEX "templates_blocks_cta_band_cta_order_idx" ON "payload"."templates_blocks_cta_band_cta" USING btree ("_order");
  CREATE INDEX "templates_blocks_cta_band_cta_parent_id_idx" ON "payload"."templates_blocks_cta_band_cta" USING btree ("_parent_id");
  CREATE UNIQUE INDEX "templates_blocks_cta_band_cta_locales_locale_parent_id_uniqu" ON "payload"."templates_blocks_cta_band_cta_locales" USING btree ("_locale","_parent_id");
  CREATE INDEX "templates_blocks_cta_band_order_idx" ON "payload"."templates_blocks_cta_band" USING btree ("_order");
  CREATE INDEX "templates_blocks_cta_band_parent_id_idx" ON "payload"."templates_blocks_cta_band" USING btree ("_parent_id");
  CREATE INDEX "templates_blocks_cta_band_path_idx" ON "payload"."templates_blocks_cta_band" USING btree ("_path");
  CREATE UNIQUE INDEX "templates_blocks_cta_band_locales_locale_parent_id_unique" ON "payload"."templates_blocks_cta_band_locales" USING btree ("_locale","_parent_id");
  CREATE INDEX "templates_updated_at_idx" ON "payload"."templates" USING btree ("updated_at");
  CREATE INDEX "templates_created_at_idx" ON "payload"."templates" USING btree ("created_at");
  CREATE INDEX "templates_rels_order_idx" ON "payload"."templates_rels" USING btree ("order");
  CREATE INDEX "templates_rels_parent_idx" ON "payload"."templates_rels" USING btree ("parent_id");
  CREATE INDEX "templates_rels_path_idx" ON "payload"."templates_rels" USING btree ("path");
  CREATE INDEX "templates_rels_products_id_idx" ON "payload"."templates_rels" USING btree ("products_id");
  CREATE INDEX "_theme_settings_v_created_at_idx" ON "payload"."_theme_settings_v" USING btree ("created_at");
  CREATE INDEX "_theme_settings_v_updated_at_idx" ON "payload"."_theme_settings_v" USING btree ("updated_at");
  CREATE INDEX "_markets_v_version_markets_payment_providers_methods_order_idx" ON "payload"."_markets_v_version_markets_payment_providers_methods" USING btree ("order");
  CREATE INDEX "_markets_v_version_markets_payment_providers_methods_parent_idx" ON "payload"."_markets_v_version_markets_payment_providers_methods" USING btree ("parent_id");
  CREATE INDEX "_markets_v_version_markets_payment_providers_order_idx" ON "payload"."_markets_v_version_markets_payment_providers" USING btree ("_order");
  CREATE INDEX "_markets_v_version_markets_payment_providers_parent_id_idx" ON "payload"."_markets_v_version_markets_payment_providers" USING btree ("_parent_id");
  CREATE INDEX "_markets_v_version_markets_order_idx" ON "payload"."_markets_v_version_markets" USING btree ("_order");
  CREATE INDEX "_markets_v_version_markets_parent_id_idx" ON "payload"."_markets_v_version_markets" USING btree ("_parent_id");
  CREATE INDEX "_markets_v_created_at_idx" ON "payload"."_markets_v" USING btree ("created_at");
  CREATE INDEX "_markets_v_updated_at_idx" ON "payload"."_markets_v" USING btree ("updated_at");
  CREATE INDEX "_navigation_v_version_header_order_idx" ON "payload"."_navigation_v_version_header" USING btree ("_order");
  CREATE INDEX "_navigation_v_version_header_parent_id_idx" ON "payload"."_navigation_v_version_header" USING btree ("_parent_id");
  CREATE UNIQUE INDEX "_navigation_v_version_header_locales_locale_parent_id_unique" ON "payload"."_navigation_v_version_header_locales" USING btree ("_locale","_parent_id");
  CREATE INDEX "_navigation_v_version_footer_groups_links_order_idx" ON "payload"."_navigation_v_version_footer_groups_links" USING btree ("_order");
  CREATE INDEX "_navigation_v_version_footer_groups_links_parent_id_idx" ON "payload"."_navigation_v_version_footer_groups_links" USING btree ("_parent_id");
  CREATE UNIQUE INDEX "_navigation_v_version_footer_groups_links_locales_locale_par" ON "payload"."_navigation_v_version_footer_groups_links_locales" USING btree ("_locale","_parent_id");
  CREATE INDEX "_navigation_v_version_footer_groups_order_idx" ON "payload"."_navigation_v_version_footer_groups" USING btree ("_order");
  CREATE INDEX "_navigation_v_version_footer_groups_parent_id_idx" ON "payload"."_navigation_v_version_footer_groups" USING btree ("_parent_id");
  CREATE UNIQUE INDEX "_navigation_v_version_footer_groups_locales_locale_parent_id" ON "payload"."_navigation_v_version_footer_groups_locales" USING btree ("_locale","_parent_id");
  CREATE INDEX "_navigation_v_version_footer_order_idx" ON "payload"."_navigation_v_version_footer" USING btree ("_order");
  CREATE INDEX "_navigation_v_version_footer_parent_id_idx" ON "payload"."_navigation_v_version_footer" USING btree ("_parent_id");
  CREATE UNIQUE INDEX "_navigation_v_version_footer_locales_locale_parent_id_unique" ON "payload"."_navigation_v_version_footer_locales" USING btree ("_locale","_parent_id");
  CREATE INDEX "_navigation_v_created_at_idx" ON "payload"."_navigation_v" USING btree ("created_at");
  CREATE INDEX "_navigation_v_updated_at_idx" ON "payload"."_navigation_v" USING btree ("updated_at");
  CREATE UNIQUE INDEX "_navigation_v_locales_locale_parent_id_unique" ON "payload"."_navigation_v_locales" USING btree ("_locale","_parent_id");
  ALTER TABLE "payload"."products" ADD CONSTRAINT "products_template_id_templates_id_fk" FOREIGN KEY ("template_id") REFERENCES "payload"."templates"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "payload"."_products_v" ADD CONSTRAINT "_products_v_version_template_id_templates_id_fk" FOREIGN KEY ("version_template_id") REFERENCES "payload"."templates"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "payload"."payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_templates_fk" FOREIGN KEY ("templates_id") REFERENCES "payload"."templates"("id") ON DELETE cascade ON UPDATE no action;
  CREATE INDEX "media_deleted_at_idx" ON "payload"."media" USING btree ("deleted_at");
  CREATE INDEX "pages_deleted_at_idx" ON "payload"."pages" USING btree ("deleted_at");
  CREATE INDEX "_pages_v_version_version_deleted_at_idx" ON "payload"."_pages_v" USING btree ("version_deleted_at");
  CREATE INDEX "redirects_deleted_at_idx" ON "payload"."redirects" USING btree ("deleted_at");
  CREATE INDEX "products_template_idx" ON "payload"."products" USING btree ("template_id");
  CREATE INDEX "_products_v_version_version_template_idx" ON "payload"."_products_v" USING btree ("version_template_id");
  CREATE INDEX "payload_locked_documents_rels_templates_id_idx" ON "payload"."payload_locked_documents_rels" USING btree ("templates_id");
  CREATE INDEX "pages_slug_idx" ON "payload"."pages" USING btree ("slug");
  CREATE INDEX "redirects_from_idx" ON "payload"."redirects" USING btree ("from");`)

  /* =====================================================================
   * 3 — Lo que Payload no sabe declarar, y la comprobación de que todo lo
   *     anterior hizo lo que dice.
   * ===================================================================== */
  await db.execute(sql`
    -- Único entre las filas que NO están en la papelera. Sin esto, quien tira
    -- una página a la papelera no puede volver a usar su dirección, y el
    -- panel se lo dice hablando de un documento que no ve. La lista vive en
    -- src/payload/trash.ts, que es de donde la lee también el test que
    -- demuestra el comportamiento.
    CREATE UNIQUE INDEX IF NOT EXISTS "pages_slug_live_unique"
      ON "payload"."pages" ("slug") WHERE "deleted_at" IS NULL;
    CREATE UNIQUE INDEX IF NOT EXISTS "redirects_from_live_unique"
      ON "payload"."redirects" ("from") WHERE "deleted_at" IS NULL;

    -- El disparador «rls_auto_enable» cubre «payload» desde
    -- 20260820_210000_rls_lockdown, pero una garantía que solo existe si
    -- alguien es superusuario no es una garantía: se repite el barrido.
    DO $$
    DECLARE t record;
    BEGIN
      FOR t IN
        SELECT tablename FROM pg_tables WHERE schemaname = 'payload' AND NOT rowsecurity
      LOOP
        EXECUTE format('ALTER TABLE payload.%I ENABLE ROW LEVEL SECURITY', t.tablename);
      END LOOP;
    END $$;

    -- La migración se prueba a sí misma.
    DO $$
    DECLARE
      unprotected int;
      policies int;
      expected text;
    BEGIN
      FOREACH expected IN ARRAY ARRAY[
        'markets', '_markets_v', '_navigation_v', '_theme_settings_v', 'templates'
      ] LOOP
        IF NOT EXISTS (
          SELECT 1 FROM pg_tables WHERE schemaname = 'payload' AND tablename = expected
        ) THEN
          RAISE EXCEPTION 'fase3: falta la tabla payload.%', expected;
        END IF;
      END LOOP;

      FOREACH expected IN ARRAY ARRAY[
        'pages_slug_live_unique', 'redirects_from_live_unique'
      ] LOOP
        IF NOT EXISTS (
          SELECT 1 FROM pg_indexes WHERE schemaname = 'payload' AND indexname = expected
        ) THEN
          RAISE EXCEPTION 'fase3: falta el índice único parcial %', expected;
        END IF;
      END LOOP;

      SELECT count(*) INTO unprotected
      FROM pg_tables WHERE schemaname = 'payload' AND NOT rowsecurity;
      IF unprotected <> 0 THEN
        RAISE EXCEPTION 'fase3: % tabla(s) de payload sin RLS', unprotected;
      END IF;

      SELECT count(*) INTO policies FROM pg_policies WHERE schemaname = 'payload';
      IF policies <> 0 THEN
        RAISE EXCEPTION 'fase3: payload tiene % política(s); deny-all espera cero', policies;
      END IF;
    END $$;
  `)
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  /* =====================================================================
   * 1 — Los índices únicos parciales de la papelera, antes de que el diff
   *     invertido quite las columnas `deleted_at` de las que cuelgan.
   * ===================================================================== */
  await db.execute(sql`
    DROP INDEX IF EXISTS "payload"."pages_slug_live_unique";
    DROP INDEX IF EXISTS "payload"."redirects_from_live_unique";
  `)

  /* =====================================================================
   * 2 — El diff generado, invertido por drizzle.
   * ===================================================================== */
  await db.execute(sql`
   ALTER TABLE "payload"."templates_blocks_stage_ctas" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "payload"."templates_blocks_stage_ctas_locales" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "payload"."templates_blocks_stage" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "payload"."templates_blocks_stage_locales" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "payload"."templates_blocks_hero_ctas" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "payload"."templates_blocks_hero_ctas_locales" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "payload"."templates_blocks_hero" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "payload"."templates_blocks_hero_locales" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "payload"."templates_blocks_anchor_nav_items" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "payload"."templates_blocks_anchor_nav_items_locales" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "payload"."templates_blocks_anchor_nav" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "payload"."templates_blocks_anchor_nav_locales" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "payload"."templates_blocks_rich_text" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "payload"."templates_blocks_rich_text_locales" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "payload"."templates_blocks_media_text" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "payload"."templates_blocks_media_text_locales" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "payload"."templates_blocks_bento_items" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "payload"."templates_blocks_bento_items_locales" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "payload"."templates_blocks_bento" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "payload"."templates_blocks_bento_locales" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "payload"."templates_blocks_stat_band_items" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "payload"."templates_blocks_stat_band_items_locales" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "payload"."templates_blocks_stat_band" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "payload"."templates_blocks_stat_band_locales" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "payload"."templates_blocks_feature_grid_items" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "payload"."templates_blocks_feature_grid_items_locales" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "payload"."templates_blocks_feature_grid" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "payload"."templates_blocks_feature_grid_locales" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "payload"."templates_blocks_steps_items" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "payload"."templates_blocks_steps_items_locales" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "payload"."templates_blocks_steps" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "payload"."templates_blocks_steps_locales" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "payload"."templates_blocks_timeline_items" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "payload"."templates_blocks_timeline_items_locales" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "payload"."templates_blocks_timeline" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "payload"."templates_blocks_timeline_locales" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "payload"."templates_blocks_hotspots_points" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "payload"."templates_blocks_hotspots_points_locales" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "payload"."templates_blocks_hotspots" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "payload"."templates_blocks_hotspots_locales" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "payload"."templates_blocks_gallery_items" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "payload"."templates_blocks_gallery_items_locales" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "payload"."templates_blocks_gallery" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "payload"."templates_blocks_gallery_locales" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "payload"."templates_blocks_spec_table" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "payload"."templates_blocks_spec_table_locales" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "payload"."prod_hero" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "payload"."prod_story" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "payload"."prod_specs" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "payload"."prod_range" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "payload"."templates_blocks_embed" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "payload"."templates_blocks_embed_locales" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "payload"."templates_blocks_waitlist" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "payload"."templates_blocks_waitlist_locales" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "payload"."prod_lead" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "payload"."templates_blocks_faq_items" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "payload"."templates_blocks_faq_items_locales" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "payload"."templates_blocks_faq" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "payload"."templates_blocks_faq_locales" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "payload"."templates_blocks_quote" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "payload"."templates_blocks_quote_locales" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "payload"."templates_blocks_cta_band_cta" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "payload"."templates_blocks_cta_band_cta_locales" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "payload"."templates_blocks_cta_band" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "payload"."templates_blocks_cta_band_locales" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "payload"."templates" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "payload"."templates_rels" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "payload"."_theme_settings_v" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "payload"."_markets_v_version_markets_payment_providers_methods" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "payload"."_markets_v_version_markets_payment_providers" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "payload"."_markets_v_version_markets" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "payload"."_markets_v" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "payload"."_navigation_v_version_header" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "payload"."_navigation_v_version_header_locales" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "payload"."_navigation_v_version_footer_groups_links" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "payload"."_navigation_v_version_footer_groups_links_locales" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "payload"."_navigation_v_version_footer_groups" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "payload"."_navigation_v_version_footer_groups_locales" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "payload"."_navigation_v_version_footer" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "payload"."_navigation_v_version_footer_locales" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "payload"."_navigation_v" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "payload"."_navigation_v_locales" DISABLE ROW LEVEL SECURITY;
  DROP TABLE "payload"."templates_blocks_stage_ctas" CASCADE;
  DROP TABLE "payload"."templates_blocks_stage_ctas_locales" CASCADE;
  DROP TABLE "payload"."templates_blocks_stage" CASCADE;
  DROP TABLE "payload"."templates_blocks_stage_locales" CASCADE;
  DROP TABLE "payload"."templates_blocks_hero_ctas" CASCADE;
  DROP TABLE "payload"."templates_blocks_hero_ctas_locales" CASCADE;
  DROP TABLE "payload"."templates_blocks_hero" CASCADE;
  DROP TABLE "payload"."templates_blocks_hero_locales" CASCADE;
  DROP TABLE "payload"."templates_blocks_anchor_nav_items" CASCADE;
  DROP TABLE "payload"."templates_blocks_anchor_nav_items_locales" CASCADE;
  DROP TABLE "payload"."templates_blocks_anchor_nav" CASCADE;
  DROP TABLE "payload"."templates_blocks_anchor_nav_locales" CASCADE;
  DROP TABLE "payload"."templates_blocks_rich_text" CASCADE;
  DROP TABLE "payload"."templates_blocks_rich_text_locales" CASCADE;
  DROP TABLE "payload"."templates_blocks_media_text" CASCADE;
  DROP TABLE "payload"."templates_blocks_media_text_locales" CASCADE;
  DROP TABLE "payload"."templates_blocks_bento_items" CASCADE;
  DROP TABLE "payload"."templates_blocks_bento_items_locales" CASCADE;
  DROP TABLE "payload"."templates_blocks_bento" CASCADE;
  DROP TABLE "payload"."templates_blocks_bento_locales" CASCADE;
  DROP TABLE "payload"."templates_blocks_stat_band_items" CASCADE;
  DROP TABLE "payload"."templates_blocks_stat_band_items_locales" CASCADE;
  DROP TABLE "payload"."templates_blocks_stat_band" CASCADE;
  DROP TABLE "payload"."templates_blocks_stat_band_locales" CASCADE;
  DROP TABLE "payload"."templates_blocks_feature_grid_items" CASCADE;
  DROP TABLE "payload"."templates_blocks_feature_grid_items_locales" CASCADE;
  DROP TABLE "payload"."templates_blocks_feature_grid" CASCADE;
  DROP TABLE "payload"."templates_blocks_feature_grid_locales" CASCADE;
  DROP TABLE "payload"."templates_blocks_steps_items" CASCADE;
  DROP TABLE "payload"."templates_blocks_steps_items_locales" CASCADE;
  DROP TABLE "payload"."templates_blocks_steps" CASCADE;
  DROP TABLE "payload"."templates_blocks_steps_locales" CASCADE;
  DROP TABLE "payload"."templates_blocks_timeline_items" CASCADE;
  DROP TABLE "payload"."templates_blocks_timeline_items_locales" CASCADE;
  DROP TABLE "payload"."templates_blocks_timeline" CASCADE;
  DROP TABLE "payload"."templates_blocks_timeline_locales" CASCADE;
  DROP TABLE "payload"."templates_blocks_hotspots_points" CASCADE;
  DROP TABLE "payload"."templates_blocks_hotspots_points_locales" CASCADE;
  DROP TABLE "payload"."templates_blocks_hotspots" CASCADE;
  DROP TABLE "payload"."templates_blocks_hotspots_locales" CASCADE;
  DROP TABLE "payload"."templates_blocks_gallery_items" CASCADE;
  DROP TABLE "payload"."templates_blocks_gallery_items_locales" CASCADE;
  DROP TABLE "payload"."templates_blocks_gallery" CASCADE;
  DROP TABLE "payload"."templates_blocks_gallery_locales" CASCADE;
  DROP TABLE "payload"."templates_blocks_spec_table" CASCADE;
  DROP TABLE "payload"."templates_blocks_spec_table_locales" CASCADE;
  DROP TABLE "payload"."prod_hero" CASCADE;
  DROP TABLE "payload"."prod_story" CASCADE;
  DROP TABLE "payload"."prod_specs" CASCADE;
  DROP TABLE "payload"."prod_range" CASCADE;
  DROP TABLE "payload"."templates_blocks_embed" CASCADE;
  DROP TABLE "payload"."templates_blocks_embed_locales" CASCADE;
  DROP TABLE "payload"."templates_blocks_waitlist" CASCADE;
  DROP TABLE "payload"."templates_blocks_waitlist_locales" CASCADE;
  DROP TABLE "payload"."prod_lead" CASCADE;
  DROP TABLE "payload"."templates_blocks_faq_items" CASCADE;
  DROP TABLE "payload"."templates_blocks_faq_items_locales" CASCADE;
  DROP TABLE "payload"."templates_blocks_faq" CASCADE;
  DROP TABLE "payload"."templates_blocks_faq_locales" CASCADE;
  DROP TABLE "payload"."templates_blocks_quote" CASCADE;
  DROP TABLE "payload"."templates_blocks_quote_locales" CASCADE;
  DROP TABLE "payload"."templates_blocks_cta_band_cta" CASCADE;
  DROP TABLE "payload"."templates_blocks_cta_band_cta_locales" CASCADE;
  DROP TABLE "payload"."templates_blocks_cta_band" CASCADE;
  DROP TABLE "payload"."templates_blocks_cta_band_locales" CASCADE;
  DROP TABLE "payload"."templates" CASCADE;
  DROP TABLE "payload"."templates_rels" CASCADE;
  DROP TABLE "payload"."_theme_settings_v" CASCADE;
  DROP TABLE "payload"."_markets_v_version_markets_payment_providers_methods" CASCADE;
  DROP TABLE "payload"."_markets_v_version_markets_payment_providers" CASCADE;
  DROP TABLE "payload"."_markets_v_version_markets" CASCADE;
  DROP TABLE "payload"."_markets_v" CASCADE;
  DROP TABLE "payload"."_navigation_v_version_header" CASCADE;
  DROP TABLE "payload"."_navigation_v_version_header_locales" CASCADE;
  DROP TABLE "payload"."_navigation_v_version_footer_groups_links" CASCADE;
  DROP TABLE "payload"."_navigation_v_version_footer_groups_links_locales" CASCADE;
  DROP TABLE "payload"."_navigation_v_version_footer_groups" CASCADE;
  DROP TABLE "payload"."_navigation_v_version_footer_groups_locales" CASCADE;
  DROP TABLE "payload"."_navigation_v_version_footer" CASCADE;
  DROP TABLE "payload"."_navigation_v_version_footer_locales" CASCADE;
  DROP TABLE "payload"."_navigation_v" CASCADE;
  DROP TABLE "payload"."_navigation_v_locales" CASCADE;
  ALTER TABLE "payload"."products" DROP CONSTRAINT IF EXISTS "products_template_id_templates_id_fk";
  
  ALTER TABLE "payload"."_products_v" DROP CONSTRAINT IF EXISTS "_products_v_version_template_id_templates_id_fk";
  
  ALTER TABLE "payload"."payload_locked_documents_rels" DROP CONSTRAINT IF EXISTS "payload_locked_documents_rels_templates_fk";
  
  DROP INDEX "payload"."media_deleted_at_idx";
  DROP INDEX "payload"."pages_deleted_at_idx";
  DROP INDEX "payload"."_pages_v_version_version_deleted_at_idx";
  DROP INDEX "payload"."redirects_deleted_at_idx";
  DROP INDEX "payload"."products_template_idx";
  DROP INDEX "payload"."_products_v_version_version_template_idx";
  DROP INDEX "payload"."payload_locked_documents_rels_templates_id_idx";
  DROP INDEX "payload"."pages_slug_idx";
  DROP INDEX "payload"."redirects_from_idx";
  CREATE UNIQUE INDEX "pages_slug_idx" ON "payload"."pages" USING btree ("slug");
  CREATE UNIQUE INDEX "redirects_from_idx" ON "payload"."redirects" USING btree ("from");
  ALTER TABLE "payload"."media" DROP COLUMN "deleted_at";
  ALTER TABLE "payload"."pages" DROP COLUMN "deleted_at";
  ALTER TABLE "payload"."_pages_v" DROP COLUMN "version_deleted_at";
  ALTER TABLE "payload"."redirects" DROP COLUMN "deleted_at";
  ALTER TABLE "payload"."products" DROP COLUMN "template_id";
  ALTER TABLE "payload"."_products_v" DROP COLUMN "version_template_id";
  ALTER TABLE "payload"."payload_locked_documents_rels" DROP COLUMN "templates_id";
  DROP TYPE "payload"."enum_templates_blocks_stage_level";
  DROP TYPE "payload"."enum_templates_blocks_stage_appearance_space_block_start";
  DROP TYPE "payload"."enum_templates_blocks_stage_appearance_space_block_end";
  DROP TYPE "payload"."enum_templates_blocks_stage_appearance_background";
  DROP TYPE "payload"."enum_templates_blocks_stage_appearance_height";
  DROP TYPE "payload"."enum_templates_blocks_stage_appearance_overlay";
  DROP TYPE "payload"."enum_templates_blocks_stage_appearance_align";
  DROP TYPE "payload"."enum_templates_blocks_stage_appearance_width";
  DROP TYPE "payload"."enum_templates_blocks_stage_appearance_reveal";
  DROP TYPE "payload"."enum_templates_blocks_stage_appearance_theme_scope";
  DROP TYPE "payload"."enum_templates_blocks_hero_level";
  DROP TYPE "payload"."enum_templates_blocks_hero_appearance_space_block_start";
  DROP TYPE "payload"."enum_templates_blocks_hero_appearance_space_block_end";
  DROP TYPE "payload"."enum_templates_blocks_hero_appearance_background";
  DROP TYPE "payload"."enum_templates_blocks_hero_appearance_align";
  DROP TYPE "payload"."enum_templates_blocks_hero_appearance_theme_scope";
  DROP TYPE "payload"."enum_templates_blocks_anchor_nav_appearance_space_block_start";
  DROP TYPE "payload"."enum_templates_blocks_anchor_nav_appearance_space_block_end";
  DROP TYPE "payload"."enum_templates_blocks_anchor_nav_appearance_background";
  DROP TYPE "payload"."enum_templates_blocks_anchor_nav_appearance_hidden_on";
  DROP TYPE "payload"."enum_templates_blocks_anchor_nav_appearance_theme_scope";
  DROP TYPE "payload"."enum_templates_blocks_rich_text_appearance_space_block_start";
  DROP TYPE "payload"."enum_templates_blocks_rich_text_appearance_space_block_end";
  DROP TYPE "payload"."enum_templates_blocks_rich_text_appearance_width";
  DROP TYPE "payload"."enum_templates_blocks_rich_text_appearance_theme_scope";
  DROP TYPE "payload"."enum_templates_blocks_media_text_appearance_space_block_start";
  DROP TYPE "payload"."enum_templates_blocks_media_text_appearance_space_block_end";
  DROP TYPE "payload"."enum_templates_blocks_media_text_appearance_background";
  DROP TYPE "payload"."enum_templates_blocks_media_text_appearance_media_position";
  DROP TYPE "payload"."enum_templates_blocks_media_text_appearance_theme_scope";
  DROP TYPE "payload"."enum_templates_blocks_bento_items_span";
  DROP TYPE "payload"."enum_templates_blocks_bento_appearance_space_block_start";
  DROP TYPE "payload"."enum_templates_blocks_bento_appearance_space_block_end";
  DROP TYPE "payload"."enum_templates_blocks_bento_appearance_background";
  DROP TYPE "payload"."enum_templates_blocks_bento_appearance_divider";
  DROP TYPE "payload"."enum_templates_blocks_bento_appearance_reveal";
  DROP TYPE "payload"."enum_templates_blocks_bento_appearance_hidden_on";
  DROP TYPE "payload"."enum_templates_blocks_bento_appearance_theme_scope";
  DROP TYPE "payload"."enum_templates_blocks_stat_band_appearance_space_block_start";
  DROP TYPE "payload"."enum_templates_blocks_stat_band_appearance_space_block_end";
  DROP TYPE "payload"."enum_templates_blocks_stat_band_appearance_background";
  DROP TYPE "payload"."enum_templates_blocks_stat_band_appearance_align";
  DROP TYPE "payload"."enum_templates_blocks_stat_band_appearance_reveal";
  DROP TYPE "payload"."enum_templates_blocks_stat_band_appearance_theme_scope";
  DROP TYPE "payload"."enum_templates_blocks_feature_grid_appearance_space_block_start";
  DROP TYPE "payload"."enum_templates_blocks_feature_grid_appearance_space_block_end";
  DROP TYPE "payload"."enum_templates_blocks_feature_grid_appearance_background";
  DROP TYPE "payload"."enum_templates_blocks_feature_grid_appearance_columns";
  DROP TYPE "payload"."enum_templates_blocks_feature_grid_appearance_align";
  DROP TYPE "payload"."enum_templates_blocks_feature_grid_appearance_theme_scope";
  DROP TYPE "payload"."enum_templates_blocks_steps_appearance_space_block_start";
  DROP TYPE "payload"."enum_templates_blocks_steps_appearance_space_block_end";
  DROP TYPE "payload"."enum_templates_blocks_steps_appearance_background";
  DROP TYPE "payload"."enum_templates_blocks_steps_appearance_columns";
  DROP TYPE "payload"."enum_templates_blocks_steps_appearance_divider";
  DROP TYPE "payload"."enum_templates_blocks_steps_appearance_reveal";
  DROP TYPE "payload"."enum_templates_blocks_steps_appearance_hidden_on";
  DROP TYPE "payload"."enum_templates_blocks_steps_appearance_theme_scope";
  DROP TYPE "payload"."enum_templates_blocks_timeline_items_state";
  DROP TYPE "payload"."enum_templates_blocks_timeline_appearance_space_block_start";
  DROP TYPE "payload"."enum_templates_blocks_timeline_appearance_space_block_end";
  DROP TYPE "payload"."enum_templates_blocks_timeline_appearance_background";
  DROP TYPE "payload"."enum_templates_blocks_timeline_appearance_reveal";
  DROP TYPE "payload"."enum_templates_blocks_timeline_appearance_theme_scope";
  DROP TYPE "payload"."enum_templates_blocks_hotspots_points_col";
  DROP TYPE "payload"."enum_templates_blocks_hotspots_points_row";
  DROP TYPE "payload"."enum_templates_blocks_hotspots_appearance_space_block_start";
  DROP TYPE "payload"."enum_templates_blocks_hotspots_appearance_space_block_end";
  DROP TYPE "payload"."enum_templates_blocks_hotspots_appearance_background";
  DROP TYPE "payload"."enum_templates_blocks_hotspots_appearance_width";
  DROP TYPE "payload"."enum_templates_blocks_hotspots_appearance_reveal";
  DROP TYPE "payload"."enum_templates_blocks_hotspots_appearance_hidden_on";
  DROP TYPE "payload"."enum_templates_blocks_hotspots_appearance_theme_scope";
  DROP TYPE "payload"."enum_templates_blocks_gallery_appearance_space_block_start";
  DROP TYPE "payload"."enum_templates_blocks_gallery_appearance_space_block_end";
  DROP TYPE "payload"."enum_templates_blocks_gallery_appearance_background";
  DROP TYPE "payload"."enum_templates_blocks_gallery_appearance_columns";
  DROP TYPE "payload"."enum_templates_blocks_gallery_appearance_reveal";
  DROP TYPE "payload"."enum_templates_blocks_gallery_appearance_theme_scope";
  DROP TYPE "payload"."enum_templates_blocks_spec_table_appearance_space_block_start";
  DROP TYPE "payload"."enum_templates_blocks_spec_table_appearance_space_block_end";
  DROP TYPE "payload"."enum_templates_blocks_spec_table_appearance_background";
  DROP TYPE "payload"."enum_templates_blocks_spec_table_appearance_divider";
  DROP TYPE "payload"."enum_templates_blocks_spec_table_appearance_reveal";
  DROP TYPE "payload"."enum_templates_blocks_spec_table_appearance_hidden_on";
  DROP TYPE "payload"."enum_templates_blocks_spec_table_appearance_theme_scope";
  DROP TYPE "payload"."enum_prod_hero_appearance_space_block_start";
  DROP TYPE "payload"."enum_prod_hero_appearance_space_block_end";
  DROP TYPE "payload"."enum_prod_hero_appearance_background";
  DROP TYPE "payload"."enum_prod_hero_appearance_divider";
  DROP TYPE "payload"."enum_prod_hero_appearance_theme_scope";
  DROP TYPE "payload"."enum_prod_story_appearance_space_block_start";
  DROP TYPE "payload"."enum_prod_story_appearance_space_block_end";
  DROP TYPE "payload"."enum_prod_story_appearance_background";
  DROP TYPE "payload"."enum_prod_story_appearance_divider";
  DROP TYPE "payload"."enum_prod_story_appearance_hidden_on";
  DROP TYPE "payload"."enum_prod_story_appearance_theme_scope";
  DROP TYPE "payload"."enum_prod_specs_appearance_space_block_start";
  DROP TYPE "payload"."enum_prod_specs_appearance_space_block_end";
  DROP TYPE "payload"."enum_prod_specs_appearance_background";
  DROP TYPE "payload"."enum_prod_specs_appearance_divider";
  DROP TYPE "payload"."enum_prod_specs_appearance_hidden_on";
  DROP TYPE "payload"."enum_prod_specs_appearance_theme_scope";
  DROP TYPE "payload"."enum_prod_range_appearance_space_block_start";
  DROP TYPE "payload"."enum_prod_range_appearance_space_block_end";
  DROP TYPE "payload"."enum_prod_range_appearance_background";
  DROP TYPE "payload"."enum_prod_range_appearance_divider";
  DROP TYPE "payload"."enum_prod_range_appearance_hidden_on";
  DROP TYPE "payload"."enum_prod_range_appearance_theme_scope";
  DROP TYPE "payload"."enum_templates_blocks_embed_provider";
  DROP TYPE "payload"."enum_templates_blocks_embed_appearance_space_block_start";
  DROP TYPE "payload"."enum_templates_blocks_embed_appearance_space_block_end";
  DROP TYPE "payload"."enum_templates_blocks_embed_appearance_background";
  DROP TYPE "payload"."enum_templates_blocks_embed_appearance_width";
  DROP TYPE "payload"."enum_templates_blocks_embed_appearance_reveal";
  DROP TYPE "payload"."enum_templates_blocks_embed_appearance_theme_scope";
  DROP TYPE "payload"."enum_templates_blocks_waitlist_intent";
  DROP TYPE "payload"."enum_templates_blocks_waitlist_appearance_space_block_start";
  DROP TYPE "payload"."enum_templates_blocks_waitlist_appearance_space_block_end";
  DROP TYPE "payload"."enum_templates_blocks_waitlist_appearance_background";
  DROP TYPE "payload"."enum_templates_blocks_waitlist_appearance_align";
  DROP TYPE "payload"."enum_templates_blocks_waitlist_appearance_theme_scope";
  DROP TYPE "payload"."enum_prod_lead_appearance_space_block_start";
  DROP TYPE "payload"."enum_prod_lead_appearance_space_block_end";
  DROP TYPE "payload"."enum_prod_lead_appearance_background";
  DROP TYPE "payload"."enum_prod_lead_appearance_divider";
  DROP TYPE "payload"."enum_prod_lead_appearance_theme_scope";
  DROP TYPE "payload"."enum_templates_blocks_faq_appearance_space_block_start";
  DROP TYPE "payload"."enum_templates_blocks_faq_appearance_space_block_end";
  DROP TYPE "payload"."enum_templates_blocks_faq_appearance_background";
  DROP TYPE "payload"."enum_templates_blocks_faq_appearance_width";
  DROP TYPE "payload"."enum_templates_blocks_faq_appearance_theme_scope";
  DROP TYPE "payload"."enum_templates_blocks_quote_appearance_space_block_start";
  DROP TYPE "payload"."enum_templates_blocks_quote_appearance_space_block_end";
  DROP TYPE "payload"."enum_templates_blocks_quote_appearance_background";
  DROP TYPE "payload"."enum_templates_blocks_quote_appearance_align";
  DROP TYPE "payload"."enum_templates_blocks_quote_appearance_theme_scope";
  DROP TYPE "payload"."enum_templates_blocks_cta_band_appearance_space_block_start";
  DROP TYPE "payload"."enum_templates_blocks_cta_band_appearance_space_block_end";
  DROP TYPE "payload"."enum_templates_blocks_cta_band_appearance_background";
  DROP TYPE "payload"."enum_templates_blocks_cta_band_appearance_align";
  DROP TYPE "payload"."enum_templates_blocks_cta_band_appearance_theme_scope";
  DROP TYPE "payload"."enum_templates_kind";
  DROP TYPE "payload"."enum__theme_settings_v_version_active_theme";
  DROP TYPE "payload"."enum__markets_v_version_markets_payment_providers_methods";
  DROP TYPE "payload"."enum__markets_v_version_markets_payment_providers_provider";
  DROP TYPE "payload"."enum__markets_v_version_markets_market";`)

  /* =====================================================================
   * 3 — Deshacer el renombrado, en orden inverso y con el mismo cuidado.
   * ===================================================================== */
  await db.execute(sql`
    ALTER SEQUENCE "payload"."markets_markets_payment_providers_methods_id_seq"
      RENAME TO "market_settings_markets_payment_providers_methods_id_seq";
    ALTER SEQUENCE "payload"."markets_id_seq" RENAME TO "market_settings_id_seq";

    ALTER TABLE "payload"."markets_markets_payment_providers_methods"
      RENAME CONSTRAINT "markets_markets_payment_providers_methods_parent_fk"
      TO "market_settings_markets_payment_providers_methods_parent_fk";
    ALTER TABLE "payload"."markets_markets_payment_providers"
      RENAME CONSTRAINT "markets_markets_payment_providers_parent_id_fk"
      TO "market_settings_markets_payment_providers_parent_id_fk";
    ALTER TABLE "payload"."markets_markets"
      RENAME CONSTRAINT "markets_markets_parent_id_fk"
      TO "market_settings_markets_parent_id_fk";

    ALTER TABLE "payload"."markets_markets_payment_providers_methods"
      RENAME CONSTRAINT "markets_markets_payment_providers_methods_pkey"
      TO "market_settings_markets_payment_providers_methods_pkey";
    ALTER TABLE "payload"."markets_markets_payment_providers"
      RENAME CONSTRAINT "markets_markets_payment_providers_pkey"
      TO "market_settings_markets_payment_providers_pkey";
    ALTER TABLE "payload"."markets_markets"
      RENAME CONSTRAINT "markets_markets_pkey" TO "market_settings_markets_pkey";
    ALTER TABLE "payload"."markets"
      RENAME CONSTRAINT "markets_pkey" TO "market_settings_pkey";

    ALTER INDEX "payload"."markets_markets_payment_providers_methods_parent_idx"
      RENAME TO "market_settings_markets_payment_providers_methods_parent_idx";
    ALTER INDEX "payload"."markets_markets_payment_providers_methods_order_idx"
      RENAME TO "market_settings_markets_payment_providers_methods_order_idx";
    ALTER INDEX "payload"."markets_markets_payment_providers_parent_id_idx"
      RENAME TO "market_settings_markets_payment_providers_parent_id_idx";
    ALTER INDEX "payload"."markets_markets_payment_providers_order_idx"
      RENAME TO "market_settings_markets_payment_providers_order_idx";
    ALTER INDEX "payload"."markets_markets_parent_id_idx"
      RENAME TO "market_settings_markets_parent_id_idx";
    ALTER INDEX "payload"."markets_markets_order_idx"
      RENAME TO "market_settings_markets_order_idx";

    ALTER TYPE "payload"."enum_markets_markets_payment_providers_methods"
      RENAME TO "enum_market_settings_markets_payment_providers_methods";
    ALTER TYPE "payload"."enum_markets_markets_payment_providers_provider"
      RENAME TO "enum_market_settings_markets_payment_providers_provider";
    ALTER TYPE "payload"."enum_markets_markets_market"
      RENAME TO "enum_market_settings_markets_market";

    ALTER TABLE "payload"."markets_markets_payment_providers_methods"
      RENAME TO "market_settings_markets_payment_providers_methods";
    ALTER TABLE "payload"."markets_markets_payment_providers"
      RENAME TO "market_settings_markets_payment_providers";
    ALTER TABLE "payload"."markets_markets" RENAME TO "market_settings_markets";
    ALTER TABLE "payload"."markets" RENAME TO "market_settings";
  `)
}
