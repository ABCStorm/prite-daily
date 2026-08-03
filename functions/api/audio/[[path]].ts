import { keyFromParam, requireApprovedUser, type AudioEnv } from "../../_shared/audio";

export const onRequest: PagesFunction<AudioEnv> = async ({ request, env, params }) => {
  if (request.method !== "GET" && request.method !== "HEAD") return new Response("Method not allowed", { status: 405 });
  const denied = await requireApprovedUser(request, env);
  if (denied) return denied;
  const key = keyFromParam(params.path);
  if (!key) return new Response("Invalid audio path", { status: 400 });

  try {
    if (request.method === "HEAD") {
      const object = await env.AUDIO.head(key);
      if (!object) return new Response("Not found", { status: 404 });
      const headers = new Headers();
      object.writeHttpMetadata(headers);
      headers.set("content-type", headers.get("content-type") ?? "audio/mpeg");
      headers.set("content-length", String(object.size));
      headers.set("etag", object.httpEtag);
      headers.set("accept-ranges", "bytes");
      headers.set("cache-control", "private, no-store");
      return new Response(null, { headers });
    }

    const hasRange = request.headers.has("range");
    const object = await env.AUDIO.get(key, hasRange ? { range: request.headers } : undefined);
    if (!object) return new Response("Not found", { status: 404 });
    const headers = new Headers();
    object.writeHttpMetadata(headers);
    headers.set("content-type", headers.get("content-type") ?? "audio/mpeg");
    headers.set("etag", object.httpEtag);
    headers.set("accept-ranges", "bytes");
    headers.set("cache-control", "private, no-store");
    let status = 200;
    if (hasRange && object.range) {
      status = 206;
      const length = "suffix" in object.range
        ? Math.min(object.range.suffix, object.size)
        : object.range.length ?? object.size - (object.range.offset ?? 0);
      const offset = "suffix" in object.range ? object.size - length : object.range.offset ?? 0;
      headers.set("content-length", String(length));
      headers.set("content-range", `bytes ${offset}-${offset + length - 1}/${object.size}`);
    } else {
      headers.set("content-length", String(object.size));
    }
    return new Response(object.body, { status, headers });
  } catch (error) {
    console.error("audio download", key, error);
    return new Response(request.headers.has("range") ? "Invalid range" : "Audio unavailable", { status: request.headers.has("range") ? 416 : 500 });
  }
};
