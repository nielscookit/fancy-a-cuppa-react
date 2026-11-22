-- Representative PostgreSQL 17 role settings, not production data.
ALTER ROLE anon SET statement_timeout TO '3s';
ALTER ROLE anon SET lock_timeout TO '1s';
ALTER ROLE anon SET search_path TO '"$user", public, extensions';
ALTER ROLE anon SET log_statement TO 'none';
ALTER ROLE anon SET session_preload_libraries TO 'auto_explain';
ALTER ROLE authenticated SET statement_timeout TO '8s';
ALTER ROLE authenticated SET lock_timeout TO '1000ms';
ALTER ROLE authenticated SET search_path TO 'public', 'extensions';
ALTER ROLE authenticated SET log_statement TO 'none';
ALTER ROLE authenticated SET idle_in_transaction_session_timeout TO '30s';
ALTER ROLE service_role SET statement_timeout TO '0';
ALTER ROLE service_role SET lock_timeout TO '0';
ALTER ROLE service_role SET search_path TO public;
ALTER ROLE service_role SET log_statement TO 'ddl';
ALTER ROLE service_role SET default_transaction_read_only TO 'off';
