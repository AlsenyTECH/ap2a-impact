#!/bin/sh
# Rejoue toutes les migrations sur une base neuve puis lance les tests.
# Usage : PGHOST=... PGPORT=... PGUSER=postgres supabase/tests/lancer.sh
set -e
cd "$(dirname "$0")/.."
psql -q -v ON_ERROR_STOP=1 -d postgres -c "drop database if exists ap2a_test" -c "create database ap2a_test"
psql -q -v ON_ERROR_STOP=1 -d ap2a_test -f tests/supabase_local.sql
for f in migrations/*.sql; do psql -q -v ON_ERROR_STOP=1 -d ap2a_test -f "$f"; done
psql -qtA -v ON_ERROR_STOP=1 -d ap2a_test -f tests/rls.sql | grep -v "^$" || exit 1
