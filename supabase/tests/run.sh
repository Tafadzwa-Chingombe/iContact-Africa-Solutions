#!/usr/bin/env bash
# Runs the portal schema + row-level-security checks against a local Postgres 16.
# Usage: PGHOST=... PGPORT=... PGUSER=postgres ./supabase/tests/run.sh
set -euo pipefail
cd "$(dirname "$0")"
psql -q -c 'drop database if exists portal_rls_test' -c 'create database portal_rls_test'
psql -q -d portal_rls_test -f supabase_stub.sql
psql -q -d portal_rls_test -v ON_ERROR_STOP=1 -f ../schema.sql >/dev/null
psql -d portal_rls_test -f rls_test.sql 2>&1 | grep -vE '^$|CONTEXT'
echo "Compare each result with its '(expect …)' label above."
