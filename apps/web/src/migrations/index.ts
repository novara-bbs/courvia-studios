import * as migration_20260819_124931_initial from './20260819_124931_initial';

export const migrations = [
  {
    up: migration_20260819_124931_initial.up,
    down: migration_20260819_124931_initial.down,
    name: '20260819_124931_initial'
  },
];
