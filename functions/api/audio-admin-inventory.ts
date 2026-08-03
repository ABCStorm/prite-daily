import { requireBatch, type AudioEnv } from "../_shared/audio";

const PAGE_SIZE = 1_000;

export const onRequest: PagesFunction<AudioEnv> = async ({ request, env }) => {
  const denied = requireBatch(request, env);
  if (denied) return denied;
  if (request.method !== "GET") return new Response("Method not allowed", { status: 405 });

  const url = new URL(request.url);
  const cursor = url.searchParams.get("cursor") || undefined;
  const page = await env.AUDIO.list({ limit: PAGE_SIZE, cursor });

  return Response.json({
    objects: page.objects.map((object) => ({
      key: object.key,
      size: object.size,
      uploaded: object.uploaded.toISOString(),
    })),
    truncated: page.truncated,
    cursor: page.truncated ? page.cursor : undefined,
  }, {
    headers: { "cache-control": "private, no-store" },
  });
};
