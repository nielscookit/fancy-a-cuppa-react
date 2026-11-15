import jpeg from "npm:jpeg-js@0.4.4";

const maxPhotoBytes = 1048576;
const objectKey = /^community\/[a-f0-9-]{36}\.jpg$/;
export const photoBucket = "community-tea-photos";
export const uuid = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;

export function parsePhotos(value: unknown): Array<{ key: string } | { bytes: Uint8Array }> {
  if (!Array.isArray(value) || value.length > 3) throw Error("Invalid photo count");
  const seen = new Set<string>();
  return value.map(photo => {
    if (typeof photo?.key === "string" && objectKey.test(photo.key)) {
      if (seen.has(photo.key)) throw Error("Invalid duplicate photo");
      seen.add(photo.key);
      return { key: photo.key };
    }
    const raw = photo?.jpeg;
    if (typeof raw !== "string" || raw.length > Math.ceil(maxPhotoBytes / 3) * 4) {
      throw Error("Invalid photo size");
    }
    const bytes = Uint8Array.from(atob(raw), c => c.charCodeAt(0));
    if (bytes.length > maxPhotoBytes || bytes[0] !== 255 || bytes[1] !== 216 || bytes[2] !== 255) {
      throw Error("Invalid JPEG photo");
    }
    return { bytes };
  });
}

export function sanitizePhoto(bytes: Uint8Array): Uint8Array {
  const image = jpeg.decode(bytes, {
    useTArray: true, maxResolutionInMP: 2.56, maxMemoryUsageInMB: 32, tolerantDecoding: false,
  });
  if (!image.width || !image.height || image.width > 1600 || image.height > 1600) {
    throw Error("Invalid photo dimensions");
  }
  // Re-encoding strips untrusted metadata, including location tags.
  const result = jpeg.encode({ width: image.width, height: image.height, data: image.data }, 78).data;
  if (result.length > maxPhotoBytes) throw Error("Invalid compressed photo size");
  return new Uint8Array(result);
}

export async function readLimitedText(req: Request, limit: number) {
  if (Number(req.headers.get("content-length")) > limit) throw new RangeError("Request too large");
  const reader = req.body?.getReader();
  if (!reader) return "";
  const decoder = new TextDecoder();
  let size = 0, text = "";
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) return text + decoder.decode();
      size += value.byteLength;
      if (size > limit) {
        await reader.cancel();
        throw new RangeError("Request too large");
      }
      text += decoder.decode(value, { stream: true });
    }
  } finally {
    reader.releaseLock();
  }
}
