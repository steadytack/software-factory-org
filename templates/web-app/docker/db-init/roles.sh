#!/bin/sh
# Runs once, when the database volume is first created (docker-entrypoint-initdb.d).
#
# One login role per use, each with the least it needs, and each password from its
# Compose secret file:
#
#   postgres            the image's superuser: this script and nothing else
#   $APP_DB_USER        the backend and the scheduler: owns the database and the
#                       public schema, runs the migrations; not a superuser
#   ${APP_DB_USER}_backup  the nightly dump: reads every table, writes nothing
#                       (pg_read_all_data, so a table added later is covered too)
#
# PostGIS is created here, as the superuser, so the app role's migration finds it
# (CREATE EXTENSION IF NOT EXISTS needs no rights when it is already there).
#
# A volume made before this script existed keeps its old single role: see README.md,
# "Secrets and database roles". Sourced by the image entrypoint, so no `set` here;
# psql stops on the first error.

secret() { tr -d '\r\n' < "/run/secrets/$1"; }

psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" \
  -v app_user="$APP_DB_USER" \
  -v backup_user="${APP_DB_USER}_backup" \
  -v app_pw="$(secret app_db_password)" \
  -v backup_pw="$(secret backup_db_password)" <<'SQL'
CREATE EXTENSION IF NOT EXISTS postgis;
CREATE ROLE :"app_user" LOGIN PASSWORD :'app_pw';
CREATE ROLE :"backup_user" LOGIN PASSWORD :'backup_pw';
ALTER DATABASE :"DBNAME" OWNER TO :"app_user";
ALTER SCHEMA public OWNER TO :"app_user";
REVOKE CREATE ON SCHEMA public FROM PUBLIC;
GRANT pg_read_all_data TO :"backup_user";
SQL
