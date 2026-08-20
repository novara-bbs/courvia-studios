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
    name: '20260820_122752_visual_sections'
  },
];
