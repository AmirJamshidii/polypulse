#!/bin/sh
set -e
# Ensure SQLite volume dir exists and is writable by nestjs (volume is often root-owned).
mkdir -p /app/data
chown -R nestjs:nodejs /app/data
# #region agent log
echo "{\"sessionId\":\"a0d098\",\"hypothesisId\":\"A\",\"location\":\"docker-entrypoint.sh\",\"message\":\"data_dir_ready\",\"data\":{\"uid\":\"$(id -u)\",\"gid\":\"$(id -g)\"},\"timestamp\":$(date +%s)000}" >&2
# #endregion
exec su-exec nestjs:nodejs sh -c "npx prisma migrate deploy && node dist/src/main.js"
