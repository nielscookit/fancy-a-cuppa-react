import { parsePhotos, photoBucket, readLimitedText, sanitizePhoto, uuid } from "./photos.ts";

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
  let data:Record<string,unknown>;
  let raw: string;
  try {
    raw = await readLimitedText(req, 4205000);
    data = JSON.parse(raw);
    if (!data || Array.isArray(data) || typeof data !== "object") throw Error("format");
  } catch (error) {
    if (error instanceof RangeError) return reply({error:"Request too large"},413);
    return reply({error:"Invalid JSON"},400);
  }
  const version4 = data.write_version === 4;
  if (!version4 && raw.length > 5000) return reply({error:"Request too large"},413);
  const serviceHeaders = { "Content-Type": "application/json", apikey: secret, Authorization: "Bearer " + secret };
  const rpc = (name: string, body: unknown) => fetch(url + "/rest/v1/rpc/" + name, {
    method: "POST", headers: serviceHeaders, body: JSON.stringify(body),
  });
  if (data.action === "photos") {
    if (!version4 || typeof data.id !== "string" || !uuid.test(data.id)) return reply({error:"Invalid tea ID"},400);
    try {
      const result = await rpc("community_tea_photo_keys", { p_tea: data.id });
      if (!result.ok) throw Error("Could not read photo keys");
      const keys: string[] = await result.json();
      if (!keys.length) return reply([]);
      const signatures = await fetch(url + "/storage/v1/object/sign/" + photoBucket, {
        method: "POST", headers: serviceHeaders, body: JSON.stringify({ paths: keys, expiresIn: 3600 }),
      });
      if (!signatures.ok) throw Error("Could not sign photos");
      const signed = await signatures.json();
      const photos = keys.map(key => {
        const path = signed.find((item: {path: string}) => item.path === key)?.signedURL;
        if (typeof path !== "string") throw Error("Missing photo signature");
        return { key, url: url + "/storage/v1" + path };
      });
      return reply(photos);
    } catch {
      return reply({error:"Tea photos are temporarily unavailable."},503);
    }
  }
  if (!version4 && data.action === undefined) data.action = "create";
  if (data.action !== "create" && data.action !== "update") return reply({error:"Invalid action"},400);
  // These fields are exclusively constructed by the server.
  delete data.photo_keys;
  delete data.uploaded_photo_keys;
  delete data.request_fingerprint;
  if (version4 && (typeof data.save_id !== "string" || !uuid.test(data.save_id)
      || (data.action === "update" && (!Number.isSafeInteger(data.expected_revision)
        || Number(data.expected_revision) < 1 || typeof data.id !== "string" || !uuid.test(data.id))))) {
    return reply({error:"Invalid save ID or revision"},400);
  }
  // Hash an IP-based key. Only the hash is stored in the database.
  const ip=(req.headers.get("cf-connecting-ip") ||
            req.headers.get("x-real-ip") ||
            req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "").trim();
  if(!ip || ip.length>100) return reply({error:"Client address unavailable"},503);
  const bytes=new TextEncoder().encode(ip+"|"+secret);
  const digest=await crypto.subtle.digest("SHA-256",bytes);
  const clientHash=[...new Uint8Array(digest)].map(b=>b.toString(16).padStart(2,"0")).join("");
  const uploaded: string[] = [];
  async function discardUploads() {
    if (!uploaded.length) return;
    await fetch(url + "/storage/v1/object/" + photoBucket, {
      method: "DELETE", headers: serviceHeaders, body: JSON.stringify({ prefixes: uploaded }),
    }).catch(() => {});
  }
  if (version4) {
    const hash = await crypto.subtle.digest("SHA-256",new TextEncoder().encode(raw));
    data.request_fingerprint = [...new Uint8Array(hash)].map(b => b.toString(16).padStart(2,"0")).join("");
    if (data.photos !== undefined) {
      let photos;
      try { photos = parsePhotos(data.photos); }
      catch { return reply({error:"Invalid photos. Use up to three JPEG files, each up to 1 MiB."},400); }
      const newCount = photos.filter(photo => "bytes" in photo).length;
      if (newCount) {
        try {
          const quota = await rpc("reserve_community_photo_upload", {p_client_hash:clientHash,p_count:newCount});
          if (!quota.ok) {
            const failure = await quota.json().catch(() => ({}));
            return String(failure.message).includes("Daily photo")
              ? reply({error:"Today's photo upload limit reached."},429)
              : reply({error:"Photo uploads are temporarily unavailable."},503);
          }
        } catch { return reply({error:"Photo uploads are temporarily unavailable."},503); }
      }
      const keys = [];
      for (const photo of photos) {
        if ("key" in photo) { keys.push(photo.key); continue; }
        let image;
        try { image = sanitizePhoto(photo.bytes); }
        catch {
          await discardUploads();
          return reply({error:"Invalid or oversized JPEG photo."},400);
        }
        const key = "community/" + crypto.randomUUID() + ".jpg";
        uploaded.push(key);
        try {
          const upload = await fetch(url + "/storage/v1/object/" + photoBucket + "/" + key, {
            method: "POST", headers: { ...serviceHeaders, "Content-Type":"image/jpeg" }, body: new Uint8Array(image).buffer,
          });
          if (!upload.ok) throw Error("Upload failed");
        } catch {
          await discardUploads();
          return reply({error:"Photo upload failed. Your changes were not saved."},503);
        }
        keys.push(key);
      }
      data.photo_keys = keys;
      data.uploaded_photo_keys = uploaded;
    }
  }
  delete data.photos;
  let result: Response;
  try {
    result = await rpc(data.action === "update" ? "update_community_tea" : "add_community_tea", {
      p_data: data, p_client_hash: clientHash,
    });
  } catch {
    // Storage and Postgres do not share a transaction. A lost response could
    // follow a committed save. Keep the objects and allow an idempotent retry.
    return reply({error:"Save could not be confirmed. Try the same save again."},503);
  }
  const payload=await result.json().catch(()=>null);
  if (!payload || result.status >= 500) {
    return reply({error:"Save could not be confirmed. Try the same save again."},503);
  }
  if (payload.replayed || !result.ok) await discardUploads();
  if(!result.ok){
    const msg=String(payload.message||"Could not save tea");
    if(msg.includes("Curated tea is read-only")) return reply({error:"This editorial tea is read-only."},403);
    if(msg.includes("Tea revision conflict")) return reply({error:"This tea was updated elsewhere. Reopen it before saving."},409);
    if(msg.includes("save identity conflict")) return reply({error:"This save ID was already used for different changes."},409);
    if(msg.includes("Daily submission limit")) return reply({error:"Today's entry limit reached. Try again tomorrow."},429);
    if(msg.includes("duplicate key")) return reply({error:"Product code already exists."},409);
    if(msg.startsWith("Invalid")) return reply({error:msg},400);
    if(msg.includes("not found")) return reply({error:"Tea not found."},404);
    if(msg.includes("belongs to another")) return reply({error:msg},409);
    return reply({error:"Tea could not be saved"},500);
  }
  return reply(payload,200);
});