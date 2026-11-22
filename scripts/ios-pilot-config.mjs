import { supabaseConfig } from '../src/data/supabaseConfig.js';

export const iosPilotMode = 'ios-pilot';
export const iosPilotMarker = 'fac-ios-pilot';
const communityFunction = '/functions/v1/community-tea-v4';

export async function verifyIosPilotBackend(fetchImpl = fetch) {
  // The same fixed HTTPS URL and public key used by the existing catalog.
  const { url, publishableKey } = supabaseConfig;
  if (url !== 'https://zfkiiqqyapahxirguxgj.supabase.co' || !publishableKey.startsWith('sb_publishable_')) {
    throw new Error('iOS Pilot requires the production catalog and its publishable key.');
  }
  const options = {
    method: 'GET', redirect: 'error', headers: { apikey: publishableKey },
    signal: AbortSignal.timeout(12000),
  };
  const results = await Promise.allSettled([
    fetchImpl(url + '/rest/v1/teas?select=origin,revision&status=eq.published&limit=1', options)
      .then(async response => {
        if (!response.ok) return false;
        const rows = await response.json();
        return Array.isArray(rows) && rows.length === 1
          && ['curated', 'community'].includes(rows[0]?.origin)
          && Number.isSafeInteger(rows[0]?.revision) && rows[0].revision >= 1;
      }),
    fetchImpl(url + communityFunction + '?capabilities=ios-pilot', options)
      .then(async response => {
        if (!response.ok) return false;
        const capability = await response.json();
        return capability?.contract === 'fancy-a-cuppa/uc02-v4' && capability.pilotReady === true;
      }),
  ]);
  const [catalog, edge] = results.map(result => result.status === 'fulfilled' && result.value === true);
  if (!catalog || !edge) {
    throw new Error('iOS Pilot blocked: V4 catalog ' + (catalog ? 'verified' : 'unavailable')
      + '; production Edge contract ' + (edge ? 'verified' : 'unavailable or not released') + '.');
  }
  return { ...supabaseConfig, communityFunction };
}
