import { supabaseConfig } from './supabaseConfig.js';
export function safeImageUrl(value) {
  try { const u=new URL(value); return u.protocol==='https:' && !u.username && !u.password ? u.href : null; } catch { return null; }
}
/** Read only the explicitly selected public projection, never the private research table. */
export async function getTeaProductImage(teaId,{signal,fetchImpl=fetch}={}) {
  const id=String(teaId||'').replace(/^cloud-/,'');
  if(!/^[0-9a-f-]{36}$/i.test(id))return null;
  const params=new URLSearchParams({select:'source_image_url,source_page_url',tea_id:'eq.'+id,limit:'1'});
  const response=await fetchImpl(supabaseConfig.url+'/rest/v1/tea_product_images?'+params,{signal,headers:{apikey:supabaseConfig.publishableKey}});
  if(!response.ok)return null;
  const [row]=await response.json();
  const url=safeImageUrl(row?.source_image_url);
  return url ? {url,sourcePage:safeImageUrl(row?.source_page_url)} : null;
}
