import { execFileSync } from 'node:child_process';

export const container = process.env.FAC_LOCAL_DB_CONTAINER || 'supabase_db_fancy-a-cuppa-react';
export function assertLocalDocker() {
  const hostOverride = process.env.DOCKER_CONTEXT ? undefined : process.env.DOCKER_HOST;
  const endpoint = hostOverride || execFileSync('docker', [
    'context', 'inspect', '--format', '{{.Endpoints.docker.Host}}',
  ], { encoding: 'utf8' }).trim();
  if (!endpoint.startsWith('unix://') || !/^supabase_db_[\w.-]+$/.test(container)) {
    throw new Error('A local Unix Docker socket and a Supabase DB container are required.');
  }
}

export function sql(source, { transaction = false } = {}) {
  return execFileSync('docker', [
    'exec', '-i', container, 'psql', '-X', '-qAt', '-v', 'ON_ERROR_STOP=1',
    ...(transaction ? ['--single-transaction'] : []), '-U', 'postgres', '-d', 'postgres', '-f', '-',
  ], { input: source, encoding: 'utf8' }).trim();
}
