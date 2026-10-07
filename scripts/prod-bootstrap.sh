#!/usr/bin/env bash
# Aplica migraciones y crea/actualiza un usuario contra la base indicada.
# Funciona en bash y zsh: no usa `read -p`, que significa otra cosa en zsh.
#
#   bash scripts/prod-bootstrap.sh <POSTGRES_PRISMA_URL> [usuario]
#
# Ejemplo:
#   bash scripts/prod-bootstrap.sh "postgresql://..." nek
#
# La contraseña se pide de forma oculta. Nada se guarda en disco.

set -euo pipefail
cd "$(dirname "$0")/.."

PGURL="${1:-}"
SEED_USER="${2:-}"

if [ -z "$PGURL" ]; then
  echo "Uso: bash scripts/prod-bootstrap.sh <POSTGRES_PRISMA_URL> [usuario]" >&2
  exit 1
fi

case "$PGURL" in
  postgres://*|postgresql://*) ;;
  *)
    echo "La URL debe empezar por postgresql://" >&2
    exit 1
    ;;
esac

if [ ! -f prisma/schema.prisma ]; then
  echo "No se encuentra prisma/schema.prisma." >&2
  exit 1
fi

export PGURL

echo "==> Aplicando migraciones"
# shellcheck disable=SC2016
env POSTGRES_PRISMA_URL="$PGURL" POSTGRES_URL_NON_POOLING="$PGURL" \
  sh -c 'npx prisma migrate deploy'

if [ -z "$SEED_USER" ]; then
  read -r -p "Nombre de usuario del mod: " SEED_USER
fi

if [ -z "$SEED_USER" ]; then
  echo "Falta el nombre de usuario. Abortando." >&2
  exit 1
fi

echo
echo "==> Creando o actualizando el usuario: $SEED_USER"

# shellcheck disable=SC2016
read -r -s -p "Contraseña (min. 8 caracteres): " SEED_PASS
echo

if [ -z "$SEED_PASS" ]; then
  echo "Falta la contraseña. Abortando." >&2
  exit 1
fi

read -r -p "Rol [admin/mod/streamer] (por defecto: admin): " SEED_ROLE
SEED_ROLE=${SEED_ROLE:-admin}

export PGURL SEED_USER SEED_PASS SEED_ROLE

# shellcheck disable=SC2016
env POSTGRES_PRISMA_URL="$PGURL" POSTGRES_URL_NON_POOLING="$PGURL" \
  SEED_USERNAME="$SEED_USER" SEED_PASSWORD="$SEED_PASS" SEED_ROLE="$SEED_ROLE" \
  sh -c 'npx tsx prisma/seed.ts --force'

echo
echo "Listo. Entra en la web con: $SEED_USER"