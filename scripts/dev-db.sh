#!/usr/bin/env bash
# Create the metadata + demo databases on a MariaDB you already run (no Docker).
# Usage: scripts/dev-db.sh [mariadb client args, e.g. -u root -p]
set -euo pipefail
cd "$(dirname "$0")/.."
mariadb --default-character-set=utf8mb4 "$@" < docker/mariadb-init/01-create-databases.sql
mariadb --default-character-set=utf8mb4 "$@" < docker/mariadb-init/02-demo-data.sql
echo "report_studio + demo_sales ready (users: studio / readonly)"
