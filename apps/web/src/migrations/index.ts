import * as migration_20260819_124931_initial from './20260819_124931_initial';
import * as migration_20260819_144554_pages from './20260819_144554_pages';
import * as migration_20260819_151837_catalog from './20260819_151837_catalog';

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
    name: '20260819_151837_catalog'
  },
];
