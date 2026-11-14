// Browser and packaged iOS origins; never use a wildcard for write requests.
const allowedOrigins = new Set(["https://nielscookit.github.io", "capacitor://localhost"]);
const cors = {
  "Access-Control-Allow-Origin": "https://nielscookit.github.io",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "content-type, apikey, authorization, x-client-info",
  "Content-Type": "application/json; charset=utf-8",
  "Vary": "Origin"
};
Deno.serve(async (req) => {
  const origin=req.headers.get("origin");
  const headers={
    ...cors,
    "Access-Control-Allow-Origin": origin && allowedOrigins.has(origin)
      ? origin : "https://nielscookit.github.io"
  };
  const reply=(body:unknown, status=200) =>
    new Response(JSON.stringify(body),{status,headers});
  if(req.method==="OPTIONS") {
    if(origin && !allowedOrigins.has(origin)) return reply({error:"Origin not allowed"},403);
    return new Response(null,{status:204,headers});
  }
  if(req.method!=="POST") return reply({error:"Method not allowed"},405);
  if(origin && !allowedOrigins.has(origin)) return reply({error:"Origin not allowed"},403);
  const url=Deno.env.get("SUPABASE_URL");
  const secret=Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if(!url || !secret) return reply({error:"Backend unavailable"},503);
  const length=Number(req.headers.get("content-length")||0);
  if(length>5000) return reply({error:"Request too large"},413);
  let data:Record<string,unknown>;
  try {
    const raw=await req.text();
    if(raw.length>5000) return reply({error:"Request too large"},413);
    data=JSON.parse(raw);
    if(!data || Array.isArray(data) || typeof data!=="object") throw Error("format");
  } catch {return reply({error:"Invalid JSON"},400);}
  // Hash an IP-based key. Only the hash is stored in the database.
  const ip=(req.headers.get("cf-connecting-ip") ||
            req.headers.get("x-real-ip") ||
            req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "").trim();
  if(!ip || ip.length>100) return reply({error:"Client address unavailable"},503);
  const bytes=new TextEncoder().encode(ip+"|"+secret);
  const digest=await crypto.subtle.digest("SHA-256",bytes);
  const clientHash=[...new Uint8Array(digest)].map(b=>b.toString(16).padStart(2,"0")).join("");
  const result=await fetch(url+"/rest/v1/rpc/"+(data.action==="update"?"update_community_tea":"add_community_tea"),{
    method:"POST",
    headers:{"Content-Type":"application/json","apikey":secret,"Authorization":"Bearer "+secret},
    body:JSON.stringify({p_data:data,p_client_hash:clientHash})
  });
  const payload=await result.json().catch(()=>({}));
  if(!result.ok){
    const msg=String(payload.message||"Could not save tea");
    if(msg.includes("Daily submission limit")) return reply({error:"Today's entry limit reached. Try again tomorrow."},429);
    if(msg.includes("duplicate key")) return reply({error:"Product code already exists."},409);
    if(msg.startsWith("Invalid")) return reply({error:msg},400);
    if(msg.includes("not found")) return reply({error:"Tea not found."},404);
    if(msg.includes("belongs to another")) return reply({error:msg},409);
    return reply({error:"Tea could not be saved"},500);
  }
  return reply(payload,200);
});