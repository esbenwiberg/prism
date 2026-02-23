#!/usr/bin/env bash
set -euo pipefail

# ---------------------------------------------------------------------------
# Prism container entrypoint
# 1. Wait for Postgres to be ready
# 2. Enable pgvector extension
# 3. Run Drizzle migrations
# 4. Start the Prism dashboard (web) and worker processes
# 5. Forward SIGTERM/SIGINT to both child processes
# ---------------------------------------------------------------------------

echo "Prism: waiting for database to be ready..."

# Wait for Postgres to accept connections (up to 30 seconds)
for i in $(seq 1 30); do
    if node -e "
        const { Pool } = require('pg');
        const pool = new Pool({ connectionString: process.env.DATABASE_URL });
        pool.query('SELECT 1').then(() => { pool.end(); process.exit(0); }).catch(() => { pool.end(); process.exit(1); });
    " 2>/dev/null; then
        echo "Prism: database is ready."
        break
    fi
    if [ "$i" -eq 30 ]; then
        echo "Prism: ERROR — database not reachable after 30 seconds."
        exit 1
    fi
    sleep 1
done

# Enable pgvector extension (idempotent)
echo "Prism: enabling pgvector extension..."
node -e "
    const { Pool } = require('pg');
    const pool = new Pool({ connectionString: process.env.DATABASE_URL });
    pool.query('CREATE EXTENSION IF NOT EXISTS vector').then(() => { pool.end(); }).catch(err => { console.error(err); pool.end(); process.exit(1); });
"

# Run Drizzle migrations (non-fatal — DB may already be up to date)
echo "Prism: running database migrations..."
npx drizzle-kit migrate || echo "Prism: WARNING — migrations skipped (may already be applied)"

# Start web server (background)
echo "Prism: starting dashboard..."
node packages/app/dist/cli/index.js serve &
WEB_PID=$!

# Start worker (background)
echo "Prism: starting worker..."
node packages/app/dist/cli/index.js worker &
WORKER_PID=$!

# Forward SIGTERM/SIGINT to both child processes
trap "kill $WEB_PID $WORKER_PID 2>/dev/null; wait" SIGTERM SIGINT

# Wait for either process to exit
wait -n
EXIT_CODE=$?

echo "Prism: a child process exited (code $EXIT_CODE), shutting down..."
kill $WEB_PID $WORKER_PID 2>/dev/null
wait

exit $EXIT_CODE
