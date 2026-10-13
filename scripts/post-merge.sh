#!/bin/bash
set -euo pipefail
pnpm install --frozen-lockfile
# Supabase Auth, RLS, and founder identity triggers require reviewed migrations.
# A task merge must not infer database changes from the application schema.
echo "Dependencies ready. Database migrations remain explicit and reviewed."
