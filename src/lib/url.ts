export function normalizeRelativePath(
  value: string | string[] | null | undefined
): string {
  const raw = Array.isArray(value) ? value[0] : value;

  if (!raw) return "/";
  if (raw.startsWith("/")) return raw;

  try {
    const url = new URL(raw);
    return `${url.pathname}${url.search}${url.hash}`;
  } catch {
    return "/";
  }
}
