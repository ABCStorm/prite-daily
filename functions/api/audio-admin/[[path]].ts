import { keyFromParam, requireBatch, type AudioEnv } from "../../_shared/audio";

const MAX_UPLOAD_BYTES = 55 * 1024 * 1024;
const MAX_PART_BYTES = 40 * 1024 * 1024;

function optionalSha(request: Request): string | null {
  const value = request.headers.get("x-audio-sha256") ?? "";
  return /^[a-f0-9]{64}$/.test(value) ? value : null;
}

export const onRequest: PagesFunction<AudioEnv> = async ({ request, env, params }) => {
  const denied = requireBatch(request, env);
  if (denied) return denied;
  const key = keyFromParam(params.path);
  if (!key) return new Response("Invalid audio path", { status: 400 });
  const url = new URL(request.url);
  const multipartAction = url.searchParams.get("multipart");

  if (multipartAction === "create" && request.method === "POST") {
    const sha256 = optionalSha(request);
    if (!sha256) return new Response("Valid SHA-256 required", { status: 400 });
    const upload = await env.AUDIO.createMultipartUpload(key, {
      httpMetadata: { contentType: "audio/mpeg", cacheControl: "private, no-store" },
      customMetadata: { sha256, archiveVersion: "v3-48k", uploadedAt: new Date().toISOString() },
    });
    return Response.json({ key, uploadId: upload.uploadId });
  }

  if (multipartAction === "part" && request.method === "PUT") {
    const uploadId = url.searchParams.get("uploadId") ?? "";
    const partNumber = Number(url.searchParams.get("partNumber"));
    const expected = Number(request.headers.get("content-length"));
    if (!uploadId || !Number.isInteger(partNumber) || partNumber < 1 || partNumber > 10_000) return new Response("Invalid multipart part", { status: 400 });
    if (!Number.isInteger(expected) || expected < 1 || expected > MAX_PART_BYTES) return new Response("Invalid part length", { status: 400 });
    const bytes = await request.arrayBuffer();
    if (bytes.byteLength !== expected) return new Response("Incomplete part", { status: 400 });
    const upload = env.AUDIO.resumeMultipartUpload(key, uploadId);
    const part = await upload.uploadPart(partNumber, bytes);
    return Response.json({ partNumber: part.partNumber, etag: part.etag, bytes: bytes.byteLength });
  }

  if (multipartAction === "complete" && request.method === "POST") {
    const input = await request.json().catch(() => null) as { uploadId?: unknown; parts?: unknown } | null;
    const uploadId = typeof input?.uploadId === "string" ? input.uploadId : "";
    const parts = Array.isArray(input?.parts) ? input.parts : [];
    if (!uploadId || !parts.length || parts.length > 10_000) return new Response("Invalid multipart completion", { status: 400 });
    const normalized = parts.map((part) => ({
      partNumber: Number((part as { partNumber?: unknown }).partNumber),
      etag: String((part as { etag?: unknown }).etag ?? ""),
    }));
    if (normalized.some((part) => !Number.isInteger(part.partNumber) || part.partNumber < 1 || !part.etag)) return new Response("Invalid completed parts", { status: 400 });
    const object = await env.AUDIO.resumeMultipartUpload(key, uploadId).complete(normalized);
    return Response.json({ key: object.key, bytes: object.size, etag: object.etag });
  }

  if (multipartAction === "abort" && request.method === "DELETE") {
    const uploadId = url.searchParams.get("uploadId") ?? "";
    if (!uploadId) return new Response("Upload ID required", { status: 400 });
    await env.AUDIO.resumeMultipartUpload(key, uploadId).abort();
    return new Response(null, { status: 204 });
  }

  if (request.method === "HEAD") {
    const object = await env.AUDIO.head(key);
    if (!object) return new Response("Not found", { status: 404, headers: { "cache-control": "private, no-store" } });
    const headers = new Headers({ "content-length": String(object.size), etag: object.httpEtag, "cache-control": "private, no-store" });
    if (object.customMetadata?.sha256) headers.set("x-audio-sha256", object.customMetadata.sha256);
    return new Response(null, { headers });
  }
  if (request.method === "GET") {
    const object = await env.AUDIO.get(key);
    if (!object) return new Response("Not found", { status: 404, headers: { "cache-control": "private, no-store" } });
    const headers = new Headers({
      "content-type": object.httpMetadata?.contentType ?? "audio/mpeg",
      "content-length": String(object.size),
      "cache-control": "private, no-store",
      etag: object.httpEtag,
    });
    return new Response(object.body, { headers });
  }
  if (request.method !== "PUT") return new Response("Method not allowed", { status: 405 });
  const expected = Number(request.headers.get("content-length"));
  if (!Number.isInteger(expected) || expected < 500 || expected > MAX_UPLOAD_BYTES) return new Response("Invalid content length", { status: 400 });
  const bytes = await request.arrayBuffer();
  if (bytes.byteLength !== expected) return new Response("Incomplete upload", { status: 400 });
  const object = await env.AUDIO.put(key, bytes, {
    httpMetadata: { contentType: "audio/mpeg", cacheControl: "private, no-store" },
    customMetadata: {
      migratedAt: new Date().toISOString(),
      sourceBytes: String(bytes.byteLength),
      ...(optionalSha(request) ? { sha256: optionalSha(request)! } : {}),
    },
  });
  return Response.json({ key: object?.key ?? key, bytes: object?.size ?? bytes.byteLength, etag: object?.etag ?? null });
};
