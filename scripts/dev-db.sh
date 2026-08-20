#!/usr/bin/env bash
# Levanta (o confirma) el Postgres local de desarrollo en 127.0.0.1:5433.
# Idempotente: si ya responde, no hace nada. Los contenedores efímeros lo
# matan entre sesiones — este script es el antídoto.
set -euo pipefail

DATA_DIR="${COURVIA_PG_DATA:-/var/lib/pg-courvia}"
PG_BIN="$(ls -d /usr/lib/postgresql/*/bin 2>/dev/null | sort -V | tail -1)"

if pg_isready -h 127.0.0.1 -p 5433 -q 2>/dev/null; then
  echo "postgres ya está arriba en 127.0.0.1:5433"
  exit 0
fi

if [ ! -d "$DATA_DIR" ]; then
  echo "No existe $DATA_DIR — inicialízalo según docs/operations.md" >&2
  exit 1
fi

su postgres -c "$PG_BIN/pg_ctl -D $DATA_DIR -l /tmp/pg.log -o '-p 5433 -k /tmp/pgsock -c listen_addresses=127.0.0.1' start"
pg_isready -h 127.0.0.1 -p 5433 -q && echo "postgres levantado en 127.0.0.1:5433"
