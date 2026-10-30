#!/bin/sh
# Nightly backup of the database and the uploaded files.
#
# Runs in the `backup` compose service (postgis image: pg_dump is the same
# major version as the server). Writes to /backups (./backups on the host):
#
#   db-YYYYmmdd-HHMMSS.dump        pg_dump custom format (pg_restore-able)
#   uploads-YYYYmmdd-HHMMSS.tar.gz the attachments volume
#
# and deletes sets older than BACKUP_RETENTION_DAYS (default 14).
#
#   BACKUP_ONCE=1   take one backup and exit (for a manual run or cron)
#
# Restore: see README.md, "Backups".
set -eu

BACKUP_DIR=/backups
RETENTION_DAYS="${BACKUP_RETENTION_DAYS:-14}"
INTERVAL_SECONDS="${BACKUP_INTERVAL_SECONDS:-86400}"

backup() {
  stamp=$(date -u +%Y%m%d-%H%M%S)
  mkdir -p "$BACKUP_DIR"
  echo "[backup] $stamp: dumping database $POSTGRES_DB"
  PGPASSWORD="$POSTGRES_PASSWORD" pg_dump -h db -U "$POSTGRES_USER" -d "$POSTGRES_DB" \
    --format=custom --no-owner --file "$BACKUP_DIR/db-$stamp.dump.partial"
  mv "$BACKUP_DIR/db-$stamp.dump.partial" "$BACKUP_DIR/db-$stamp.dump"

  echo "[backup] $stamp: archiving uploads"
  tar -czf "$BACKUP_DIR/uploads-$stamp.tar.gz.partial" -C /uploads .
  mv "$BACKUP_DIR/uploads-$stamp.tar.gz.partial" "$BACKUP_DIR/uploads-$stamp.tar.gz"

  # Only complete sets are pruned; a half-written *.partial never counts.
  find "$BACKUP_DIR" -maxdepth 1 \( -name 'db-*.dump' -o -name 'uploads-*.tar.gz' \) \
    -mtime +"$RETENTION_DAYS" -print -delete
  echo "[backup] $stamp: done ($(du -sh "$BACKUP_DIR" | cut -f1) in $BACKUP_DIR)"
}

if [ "${BACKUP_ONCE:-0}" = "1" ]; then
  backup
  exit 0
fi

while true; do
  backup || echo "[backup] FAILED; retrying next cycle" >&2
  sleep "$INTERVAL_SECONDS"
done
