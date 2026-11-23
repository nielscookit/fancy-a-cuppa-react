-- Five role paths read from production on 2026-11-23, no credentials or data.
ALTER ROLE postgres SET search_path TO E'\\$user', 'public', 'extensions';
ALTER ROLE supabase_admin SET search_path TO '$user', 'public', 'auth', 'extensions';
ALTER ROLE supabase_auth_admin SET search_path TO 'auth';
ALTER ROLE supabase_realtime_admin SET search_path TO 'public', 'extensions', 'realtime';
ALTER ROLE supabase_storage_admin SET search_path TO 'storage';
