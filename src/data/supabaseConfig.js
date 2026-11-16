/**
 * Public client configuration for the existing Fancy a Cuppa test catalog.
 * Publishable keys are intentionally public and obey server-side RLS.
 * Never put sb_secret / service_role credentials in the frontend.
 */
export const uc02IosConfig = typeof __FAC_UC02_IOS_CONFIG__ === 'undefined'
  ? null : __FAC_UC02_IOS_CONFIG__;

export const supabaseConfig = Object.freeze(uc02IosConfig ?? {
  url: 'https://zfkiiqqyapahxirguxgj.supabase.co',
  publishableKey: 'sb_publishable_Fsijwz4MapCz77S2xDuPKQ_hnAXzaU7',
});
