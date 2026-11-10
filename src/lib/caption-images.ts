import type { ActiveStudyCaption } from "@/lib/studies";

export function resolveCaptionImageUrl(raw: string | null | undefined) {
  if (!raw) {
    return null;
  }

  if (/^https?:\/\//i.test(raw) || raw.startsWith("data:")) {
    return raw;
  }

  const base = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!base) {
    return raw;
  }

  const normalized = raw.replace(/^\/+/, "");
  return `${base}/storage/v1/object/public/${normalized}`;
}

export function resolveStudyCaptionImageUrl(caption: ActiveStudyCaption | undefined) {
  const imageUrlFromRelation = Array.isArray(caption?.images)
    ? caption?.images[0]?.url
    : caption?.images?.url;

  return resolveCaptionImageUrl(imageUrlFromRelation ?? null);
}
