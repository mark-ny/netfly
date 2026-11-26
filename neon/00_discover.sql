-- Run in the Neon SQL editor AFTER enabling Neon Auth. Read-only. Send me the output
-- (no secrets are shown) so the schema's foreign keys and session checks can be finalised.
select table_name, column_name, data_type
from information_schema.columns
where table_schema = 'neon_auth' and table_name in ('user','session')
order by table_name, ordinal_position;
select rolname from pg_roles where rolname in ('anonymous','authenticated','authenticator','netfly_service');
select extname, extversion from pg_extension where extname in ('pg_session_jwt','pgcrypto');
select version();
