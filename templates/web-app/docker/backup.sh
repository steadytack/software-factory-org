#!/bin/sh
# Nightly backup of the database and the uploaded files.
#
# Runs in the `backup` compose service (postgis image: pg_dump is the same
# major version as the server), as the read-only backup role (BACKUP_DB_USER,
# its password in the Compose secret backup_db_password). Writes to /backups (./backups on the host):
#
#   db-YYYYmmdd-HHMMSS.dump        pg_dump custom format (pg_restore-able)
#   uploads-YYYYmmdd-HHMMSS.tar.gz the attachments volume
#
# and deletes sets older than BACKUP_RETENTION_DAYS (default 14).
#
# When it runs: once at start-up if the newest dump is over 20 hours old, then
# every day at BACKUP_AT (UTC, default 02:30). The wait compares the clock, not
# a count of seconds, so a computer that sleeps still backs up when it wakes
# (a plain `sleep 86400` stops counting while the machine is suspended).
#
#   BACKUP_ONCE=1   take one backup and exit, non-zero if it failed (manual run or cron)
#
# Restore: see README.md, "Backups". Copy ./backups off this machine too.
#
# The dump leaves out what PostGIS owns (its extension comment and the spatial_ref_sys
# rows), so it restores cleanly as the app's own role (README.md, "Backups").
#
# Found in an app built from this template: a failed pg_dump
# left an empty file named as a finished dump, which then passed for a backup.
set -eu

BACKUP_DIR=/backups
RETENTION_DAYS="${BACKUP_RETENTION_DAYS:-14}"
BACKUP_AT="${BACKUP_AT:-02:30}"
STALE_SECONDS=72000

# Every step's status is checked by hand: `set -e` does not apply inside a function
# called as `backup || ...` (POSIX), so a failed step would otherwise carry on.
backup() {
  stamp=$(date -u +%Y%m%d-%H%M%S)
  dump="$BACKUP_DIR/db-$stamp.dump.partial"
  files="$BACKUP_DIR/uploads-$stamp.tar.gz.partial"
  mkdir -p "$BACKUP_DIR"

  echo "[backup] $stamp: dumping database $POSTGRES_DB"
  if ! PGPASSWORD="$(tr -d '\r\n' < /run/secrets/backup_db_password)" \
    pg_dump -h db -U "$BACKUP_DB_USER" -d "$POSTGRES_DB" \
    --format=custom --no-owner --no-comments --exclude-table-data=public.spatial_ref_sys \
    --file "$dump"; then
    rm -f "$dump"
    echo "[backup] $stamp: FAILED: pg_dump did not finish" >&2
    return 1
  fi
  # A dump is a backup only if it is a readable archive.
  if [ ! -s "$dump" ] || ! pg_restore --list "$dump" > /dev/null 2>&1; then
    rm -f "$dump"
    echo "[backup] $stamp: FAILED: the dump is empty or not a readable archive" >&2
    return 1
  fi

  echo "[backup] $stamp: archiving uploads"
  if ! tar -czf "$files" -C /uploads . || ! tar -tzf "$files" > /dev/null 2>&1; then
    rm -f "$dump" "$files"
    echo "[backup] $stamp: FAILED: the uploads archive did not finish or does not read back" >&2
    return 1
  fi

  # Both parts are good: only now do they take finished names.
  mv "$dump" "$BACKUP_DIR/db-$stamp.dump"
  mv "$files" "$BACKUP_DIR/uploads-$stamp.tar.gz"

  # Only after a good set: prune old sets, and remove empty files, which are never backups.
  # A half-written *.partial never counts.
  find "$BACKUP_DIR" -maxdepth 1 \( -name 'db-*.dump' -o -name 'uploads-*.tar.gz' \) \
    -mtime +"$RETENTION_DAYS" -print -delete
  find "$BACKUP_DIR" -maxdepth 1 \( -name 'db-*.dump' -o -name 'uploads-*.tar.gz' \) -size 0 -print -delete
  echo "[backup] $stamp: done ($(du -sh "$BACKUP_DIR" | cut -f1) in $BACKUP_DIR)"
}

# A few tries a minute apart: at start-up the database's name may not resolve yet.
backup_with_retries() {
  tries="${BACKUP_TRIES:-5}"
  n=1
  while [ "$n" -le "$tries" ]; do
    if backup; then return 0; fi
    if [ "$n" -lt "$tries" ]; then
      echo "[backup] try $n of $tries failed; again in ${BACKUP_RETRY_SECONDS:-60} s" >&2
      sleep "${BACKUP_RETRY_SECONDS:-60}"
    fi
    n=$((n + 1))
  done
  return 1
}

# Seconds since the newest non-empty dump was written; a large number when there is none.
newest_age() {
  newest=$(find "$BACKUP_DIR" -maxdepth 1 -name 'db-*.dump' -size +0 -printf '%T@\n' 2>/dev/null | sort -n | tail -1)
  if [ -z "$newest" ]; then echo 999999999; else echo $(( $(date -u +%s) - ${newest%.*} )); fi
}

# The next BACKUP_AT today or tomorrow, as epoch seconds.
next_run() {
  now=$(date -u +%s)
  at=$(date -u -d "today $BACKUP_AT" +%s)
  if [ "$at" -le "$now" ]; then at=$(date -u -d "tomorrow $BACKUP_AT" +%s); fi
  echo "$at"
}

if [ "${BACKUP_ONCE:-0}" = "1" ]; then
  backup || exit 1
  exit 0
fi

if [ "$(newest_age)" -gt "$STALE_SECONDS" ]; then
  backup_with_retries || echo "[backup] FAILED; will try again at $BACKUP_AT UTC" >&2
fi

while true; do
  target=$(next_run)
  echo "[backup] next backup at $(date -u -d "@$target" '+%Y-%m-%d %H:%M UTC')"
  while [ "$(date -u +%s)" -lt "$target" ]; do sleep 30; done
  backup_with_retries || echo "[backup] FAILED; will try again at $BACKUP_AT UTC" >&2
done
