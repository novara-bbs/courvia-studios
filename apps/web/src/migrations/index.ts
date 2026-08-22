import * as migration_20260819_124931_initial from './20260819_124931_initial';
import * as migration_20260819_144554_pages from './20260819_144554_pages';
import * as migration_20260819_151837_catalog from './20260819_151837_catalog';
import * as migration_20260819_172444_spec_label from './20260819_172444_spec_label';
import * as migration_20260819_210633_commerce_orders from './20260819_210633_commerce_orders';
import * as migration_20260819_223413_outbox_effects from './20260819_223413_outbox_effects';
import * as migration_20260820_073808_nav_and_product_media from './20260820_073808_nav_and_product_media';
import * as migration_20260820_075636_leads_funnel_outbox from './20260820_075636_leads_funnel_outbox';
import * as migration_20260820_092450_cms_commerce_and_methods from './20260820_092450_cms_commerce_and_methods';
import * as migration_20260820_094933_nav_pro_hero_level from './20260820_094933_nav_pro_hero_level';
import * as migration_20260820_104736_media_governance_spec_evidence from './20260820_104736_media_governance_spec_evidence';
import * as migration_20260820_122752_visual_sections from './20260820_122752_visual_sections';
import * as migration_20260820_165317_landing_vocabulary from './20260820_165317_landing_vocabulary';
import * as migration_20260820_210000_rls_lockdown from './20260820_210000_rls_lockdown';
import * as migration_20260820_215618_page_seo_and_redirects from './20260820_215618_page_seo_and_redirects';
import * as migration_20260820_224603_fulfilment_shipments from './20260820_224603_fulfilment_shipments';
import * as migration_20260821_214924_commerce_ownership from './20260821_214924_commerce_ownership';
import * as migration_20260821_234246_fase3_templates_trash_versions from './20260821_234246_fase3_templates_trash_versions';
import * as migration_20260821_235907_fase4_carrito from './20260821_235907_fase4_carrito';
import * as migration_20260822_003001_fase4b_sin_versiones_en_mercados from './20260822_003001_fase4b_sin_versiones_en_mercados';
import * as migration_20260822_072445_fase5_envio_por_mercado from './20260822_072445_fase5_envio_por_mercado';
import * as migration_20260822_102710_fase8_ventana_de_desistimiento from './20260822_102710_fase8_ventana_de_desistimiento';
import * as migration_20260822_185435_fase8_vigilancia_del_cron from './20260822_185435_fase8_vigilancia_del_cron';
import * as migration_20260822_192825_fase8_colector_de_csp from './20260822_192825_fase8_colector_de_csp';

export const migrations = [
  {
    up: migration_20260819_124931_initial.up,
    down: migration_20260819_124931_initial.down,
    name: '20260819_124931_initial',
  },
  {
    up: migration_20260819_144554_pages.up,
    down: migration_20260819_144554_pages.down,
    name: '20260819_144554_pages',
  },
  {
    up: migration_20260819_151837_catalog.up,
    down: migration_20260819_151837_catalog.down,
    name: '20260819_151837_catalog',
  },
  {
    up: migration_20260819_172444_spec_label.up,
    down: migration_20260819_172444_spec_label.down,
    name: '20260819_172444_spec_label',
  },
  {
    up: migration_20260819_210633_commerce_orders.up,
    down: migration_20260819_210633_commerce_orders.down,
    name: '20260819_210633_commerce_orders',
  },
  {
    up: migration_20260819_223413_outbox_effects.up,
    down: migration_20260819_223413_outbox_effects.down,
    name: '20260819_223413_outbox_effects',
  },
  {
    up: migration_20260820_073808_nav_and_product_media.up,
    down: migration_20260820_073808_nav_and_product_media.down,
    name: '20260820_073808_nav_and_product_media',
  },
  {
    up: migration_20260820_075636_leads_funnel_outbox.up,
    down: migration_20260820_075636_leads_funnel_outbox.down,
    name: '20260820_075636_leads_funnel_outbox',
  },
  {
    up: migration_20260820_092450_cms_commerce_and_methods.up,
    down: migration_20260820_092450_cms_commerce_and_methods.down,
    name: '20260820_092450_cms_commerce_and_methods',
  },
  {
    up: migration_20260820_094933_nav_pro_hero_level.up,
    down: migration_20260820_094933_nav_pro_hero_level.down,
    name: '20260820_094933_nav_pro_hero_level',
  },
  {
    up: migration_20260820_104736_media_governance_spec_evidence.up,
    down: migration_20260820_104736_media_governance_spec_evidence.down,
    name: '20260820_104736_media_governance_spec_evidence',
  },
  {
    up: migration_20260820_122752_visual_sections.up,
    down: migration_20260820_122752_visual_sections.down,
    name: '20260820_122752_visual_sections',
  },
  {
    up: migration_20260820_165317_landing_vocabulary.up,
    down: migration_20260820_165317_landing_vocabulary.down,
    name: '20260820_165317_landing_vocabulary',
  },
  {
    up: migration_20260820_210000_rls_lockdown.up,
    down: migration_20260820_210000_rls_lockdown.down,
    name: '20260820_210000_rls_lockdown',
  },
  {
    up: migration_20260820_215618_page_seo_and_redirects.up,
    down: migration_20260820_215618_page_seo_and_redirects.down,
    name: '20260820_215618_page_seo_and_redirects',
  },
  {
    up: migration_20260820_224603_fulfilment_shipments.up,
    down: migration_20260820_224603_fulfilment_shipments.down,
    name: '20260820_224603_fulfilment_shipments',
  },
  {
    up: migration_20260821_214924_commerce_ownership.up,
    down: migration_20260821_214924_commerce_ownership.down,
    name: '20260821_214924_commerce_ownership',
  },
  {
    up: migration_20260821_234246_fase3_templates_trash_versions.up,
    down: migration_20260821_234246_fase3_templates_trash_versions.down,
    name: '20260821_234246_fase3_templates_trash_versions',
  },
  {
    up: migration_20260821_235907_fase4_carrito.up,
    down: migration_20260821_235907_fase4_carrito.down,
    name: '20260821_235907_fase4_carrito',
  },
  {
    up: migration_20260822_003001_fase4b_sin_versiones_en_mercados.up,
    down: migration_20260822_003001_fase4b_sin_versiones_en_mercados.down,
    name: '20260822_003001_fase4b_sin_versiones_en_mercados',
  },
  {
    up: migration_20260822_072445_fase5_envio_por_mercado.up,
    down: migration_20260822_072445_fase5_envio_por_mercado.down,
    name: '20260822_072445_fase5_envio_por_mercado',
  },
  {
    up: migration_20260822_102710_fase8_ventana_de_desistimiento.up,
    down: migration_20260822_102710_fase8_ventana_de_desistimiento.down,
    name: '20260822_102710_fase8_ventana_de_desistimiento',
  },
  {
    up: migration_20260822_185435_fase8_vigilancia_del_cron.up,
    down: migration_20260822_185435_fase8_vigilancia_del_cron.down,
    name: '20260822_185435_fase8_vigilancia_del_cron',
  },
  {
    up: migration_20260822_192825_fase8_colector_de_csp.up,
    down: migration_20260822_192825_fase8_colector_de_csp.down,
    name: '20260822_192825_fase8_colector_de_csp'
  },
];
