export const THUMBNAIL_SIZES = [
  320,
  480,
  640,
  750,
  828,
  1080,
  1200,
  1920,
  2048,
  3840,
];

// Only these image CDNs publish the size-suffixed files used below.
const THUMBNAIL_HOSTS = new Set([
  "images.crackd.ai",
  "images.almostcrackd.ai",
]);

function stripQueryAndHash(url: string) {
  const [withoutHash] = url.split("#");
  const [withoutQuery] = withoutHash.split("?");
  return withoutQuery;
}

function removeTrailingSize(basePath: string) {
  const match = basePath.match(/-(\d+)$/);
  if (!match) return basePath;

  const possibleSize = Number(match[1]);
  return THUMBNAIL_SIZES.includes(possibleSize)
    ? basePath.slice(0, -match[0].length)
    : basePath;
}

function closestSize(target: number) {
  return THUMBNAIL_SIZES.reduce((closest, size) => {
    return Math.abs(size - target) < Math.abs(closest - target)
      ? size
      : closest;
  });
}

export function buildThumbnailVariants(imageUrl: string | null | undefined) {
  if (!imageUrl) return null;

  try {
    const url = new URL(imageUrl);
    if (
      !["http:", "https:"].includes(url.protocol) ||
      !THUMBNAIL_HOSTS.has(url.hostname)
    ) {
      return null;
    }
  } catch {
    return null;
  }

  const cleanUrl = stripQueryAndHash(imageUrl);
  const match = cleanUrl.match(/^(.*)\.([A-Za-z0-9]+)$/);
  if (!match) return null;

  const extension = match[2];
  const basePath = removeTrailingSize(match[1]);

  const srcSet = THUMBNAIL_SIZES.map(
    (size) => `${basePath}-${size}.${extension} ${size}w`
  ).join(", ");

  const displaySize = closestSize(900);
  const gridSize = closestSize(640);
  const blurSize = THUMBNAIL_SIZES[0];

  return {
    original: imageUrl,
    basePath,
    extension,
    src: `${basePath}-${displaySize}.${extension}`,
    srcSet,
    sizes: "(min-width: 1024px) 900px, (min-width: 640px) 720px, 100vw",
    grid: `${basePath}-${gridSize}.${extension}`,
    blur: `${basePath}-${blurSize}.${extension}`,
  };
}
