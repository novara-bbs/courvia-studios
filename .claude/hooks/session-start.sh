#!/bin/bash
# SessionStart — deja el stack de Courvia listo: dependencias instaladas y
# el Postgres local de desarrollo (127.0.0.1:5433) levantado. Idempotente.
set -euo pipefail

# Solo en Claude Code web (contenedor efímero); en local no toca nada.
if [ "${CLAUDE_CODE_REMOTE:-}" != "true" ]; then
  exit 0
fi

cd "$CLAUDE_PROJECT_DIR"

# Dependencias (aprovecha la caché del contenedor).
if [ ! -d node_modules ]; then
  corepack enable >/dev/null 2>&1 || true
  pnpm install --frozen-lockfile
fi

# Postgres local si existe el data dir (los contenedores lo matan entre
# sesiones; sin él fallan build con DATABASE_URL, tests y seeds).
if [ -d /var/lib/pg-courvia ]; then
  bash scripts/dev-db.sh || echo "aviso: postgres local no arrancó — ver docs/operations.md"
fi
