"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from "react";

import { buildThumbnailVariants } from "@/lib/thumbnails";

const DOUBLE_TAP_WINDOW_MS = 320;
const DOUBLE_TAP_MOVE_THRESHOLD_PX = 20;

type DoubleTapArea = "caption" | "image";
type TapGestureState = {
  area: DoubleTapArea;
  pointerId: number;
  pointerType: string;
  startX: number;
  startY: number;
};

type TapRecord = {
  area: DoubleTapArea;
  pointerType: string;
  timeMs: number;
  x: number;
  y: number;
};

function getTapNowMs() {
  return typeof performance !== "undefined" ? performance.now() : Date.now();
}

function isHeartVoteControlTarget(target: EventTarget | null) {
  return target instanceof Element
    ? Boolean(target.closest("[data-heart-vote-control]"))
    : false;
}

function isMatchingTapRecord({
  area,
  pointerType,
  x,
  y,
}: {
  area: DoubleTapArea;
  pointerType: string;
  x: number;
  y: number;
}, lastTap: TapRecord | null) {
  return Boolean(
    lastTap &&
      lastTap.area === area &&
      lastTap.pointerType === pointerType &&
      getTapNowMs() - lastTap.timeMs <= DOUBLE_TAP_WINDOW_MS &&
      Math.hypot(x - lastTap.x, y - lastTap.y) <= DOUBLE_TAP_MOVE_THRESHOLD_PX
  );
}

export function SwipeVoteCard({
  actionRow,
  captionId,
  content,
  imageSrc,
  onDoubleTapHeart,
  preloadImageUrls,
  reservedBottomPx = 280,
  reservedTopPx = 0,
}: {
  actionRow?: ReactNode;
  captionId: string;
  content: string | null;
  imageSrc: string | null;
  onDoubleTapHeart?: () => void;
  preloadImageUrls?: string[];
  reservedBottomPx?: number;
  reservedTopPx?: number;
}) {
  const preloadedImages = useRef<Set<string>>(new Set());
  const [viewportHeight, setViewportHeight] = useState<number>(720);
  const [containerWidth, setContainerWidth] = useState<number | null>(null);
  const [imageRatio, setImageRatio] = useState<number | null>(null);
  const [loadedImageSrc, setLoadedImageSrc] = useState<string | null>(null);
  const [failedThumbnailSrc, setFailedThumbnailSrc] = useState<string | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const imageRef = useRef<HTMLImageElement | null>(null);
  const activeTapRef = useRef<TapGestureState | null>(null);
  const lastTapRef = useRef<TapRecord | null>(null);

  useEffect(() => {
    const updateHeight = () => {
      const next = window.visualViewport?.height ?? window.innerHeight ?? 720;
      setViewportHeight(next);
    };

    updateHeight();
    window.addEventListener("resize", updateHeight);
    window.addEventListener("orientationchange", updateHeight);

    return () => {
      window.removeEventListener("resize", updateHeight);
      window.removeEventListener("orientationchange", updateHeight);
    };
  }, []);

  const thumbSources = useMemo(
    () => buildThumbnailVariants(imageSrc),
    [imageSrc]
  );
  const activeThumbSources = failedThumbnailSrc === imageSrc ? null : thumbSources;
  const displaySrc = activeThumbSources?.src ?? imageSrc ?? undefined;
  const displaySrcSet = activeThumbSources?.srcSet;
  const displaySizes = activeThumbSources?.sizes;
  const isContentVisible = !displaySrc || loadedImageSrc === displaySrc;

  const handleImageError = useCallback(() => {
    if (activeThumbSources) {
      setFailedThumbnailSrc(imageSrc);
      return;
    }

    setLoadedImageSrc(displaySrc ?? "__error__");
  }, [activeThumbSources, displaySrc, imageSrc]);

  useEffect(() => {
    let resetFrameId: number | null = null;

    if (!displaySrc) {
      resetFrameId = window.requestAnimationFrame(() => {
        setLoadedImageSrc(null);
        setImageRatio(null);
      });
      return () => {
        if (resetFrameId !== null) {
          window.cancelAnimationFrame(resetFrameId);
        }
      };
    }

    resetFrameId = window.requestAnimationFrame(() => {
      setLoadedImageSrc(null);
    });

    const img = imageRef.current;

    if (!img) {
      return () => {
        if (resetFrameId !== null) {
          window.cancelAnimationFrame(resetFrameId);
        }
      };
    }

    const syncLoadedImageState = () => {
      if (!img.complete) {
        return false;
      }

      if (!img.naturalWidth) {
        handleImageError();
        return true;
      }

      if (img.naturalWidth && img.naturalHeight) {
        setImageRatio(img.naturalHeight / img.naturalWidth);
      }

      setLoadedImageSrc(displaySrc);
      return true;
    };

    const syncFrameId = window.requestAnimationFrame(() => {
      syncLoadedImageState();
    });

    return () => {
      if (resetFrameId !== null) {
        window.cancelAnimationFrame(resetFrameId);
      }
      window.cancelAnimationFrame(syncFrameId);
    };
  }, [displaySrc, handleImageError]);

  useEffect(() => {
    if (!preloadImageUrls?.length || !isContentVisible) return;

    type PreloadTarget = {
      key: string;
      src: string;
      srcSet?: string;
      sizes?: string;
    };

    const preloadTargets = preloadImageUrls
      .map((url): PreloadTarget | null => {
        const variants = buildThumbnailVariants(url);
        if (variants) {
          return {
            key: variants.original ?? variants.src ?? variants.grid ?? url,
            src: variants.src ?? variants.grid ?? url,
            srcSet: variants.srcSet,
            sizes: variants.sizes,
          };
        }

        if (!url) return null;
        return { key: url, src: url };
      })
      .filter((target): target is PreloadTarget => Boolean(target));

    preloadTargets.forEach(({ key, src, srcSet, sizes }) => {
      if (!key || preloadedImages.current.has(key)) return;

      preloadedImages.current.add(key);
      const img = new window.Image();

      if (srcSet) {
        img.onerror = () => {
          img.onerror = null;
          img.removeAttribute("srcset");
          img.removeAttribute("sizes");
          img.src = key;
        };
      }

      if (srcSet) {
        img.srcset = srcSet;
      }
      if (sizes) {
        img.sizes = sizes;
      }

      img.src = src;
    });
  }, [isContentVisible, preloadImageUrls]);

  useEffect(() => {
    if (!containerRef.current) return;

    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        setContainerWidth(entry.contentRect.width);
      }
    });

    observer.observe(containerRef.current);
    setContainerWidth(containerRef.current.getBoundingClientRect().width);

    return () => observer.disconnect();
  }, []);

  const cardStyle = useMemo(() => {
    const measuredHeight = viewportHeight || 720;
    const isShort = measuredHeight < 740;
    const isTiny = measuredHeight < 540;
    const actionRowReserve = actionRow ? (isTiny ? 54 : isShort ? 60 : 64) : 0;
    const captionReserve = (isTiny ? 88 : isShort ? 100 : 112) + actionRowReserve;
    const reserved = reservedBottomPx + reservedTopPx + captionReserve;
    const minHeight = isTiny ? 132 : isShort ? 168 : 220;
    const available = Math.max(minHeight, measuredHeight - reserved);
    const ratio = imageRatio ?? 0.75;
    const width = containerWidth ?? 360;
    const ratioHeight = width * ratio;
    const height = Math.min(available, Math.max(minHeight, ratioHeight));

    return {
      height,
      maxHeight: available,
      minHeight,
    } satisfies CSSProperties;
  }, [
    actionRow,
    containerWidth,
    imageRatio,
    reservedBottomPx,
    reservedTopPx,
    viewportHeight,
  ]);

  const handleTapPointerDown = useCallback(
    (area: DoubleTapArea, event: ReactPointerEvent<HTMLDivElement>) => {
      if (!onDoubleTapHeart || !event.isPrimary) {
        activeTapRef.current = null;
        return;
      }

      if (
        (event.pointerType === "mouse" && event.button !== 0) ||
        isHeartVoteControlTarget(event.target)
      ) {
        activeTapRef.current = null;
        return;
      }

      const pointerType = event.pointerType || "mouse";

      if (
        pointerType !== "mouse" &&
        isMatchingTapRecord(
          {
            area,
            pointerType,
            x: event.clientX,
            y: event.clientY,
          },
          lastTapRef.current
        )
      ) {
        lastTapRef.current = null;
        activeTapRef.current = null;
        onDoubleTapHeart();
        return;
      }

      activeTapRef.current = {
        area,
        pointerId: event.pointerId,
        pointerType,
        startX: event.clientX,
        startY: event.clientY,
      };
    },
    [onDoubleTapHeart]
  );

  const handleTapPointerCancel = useCallback(
    (event: ReactPointerEvent<HTMLDivElement>) => {
      if (activeTapRef.current?.pointerId === event.pointerId) {
        activeTapRef.current = null;
      }
    },
    []
  );

  const handleTapPointerUp = useCallback(
    (area: DoubleTapArea, event: ReactPointerEvent<HTMLDivElement>) => {
      if (!onDoubleTapHeart || isHeartVoteControlTarget(event.target)) {
        activeTapRef.current = null;
        return;
      }

      const activeTap = activeTapRef.current;
      activeTapRef.current = null;

      if (
        !activeTap ||
        activeTap.pointerId !== event.pointerId ||
        activeTap.area !== area
      ) {
        return;
      }

      const deltaX = event.clientX - activeTap.startX;
      const deltaY = event.clientY - activeTap.startY;

      if (
        Math.hypot(deltaX, deltaY) > DOUBLE_TAP_MOVE_THRESHOLD_PX
      ) {
        return;
      }

      const nowMs = getTapNowMs();
      const lastTap = lastTapRef.current;

      if (
        isMatchingTapRecord(
          {
            area,
            pointerType: activeTap.pointerType,
            x: event.clientX,
            y: event.clientY,
          },
          lastTap
        )
      ) {
        lastTapRef.current = null;
        onDoubleTapHeart();
        return;
      }

      lastTapRef.current = {
        area,
        pointerType: activeTap.pointerType,
        timeMs: nowMs,
        x: event.clientX,
        y: event.clientY,
      };
    },
    [onDoubleTapHeart]
  );

  return (
    <div
      id="caption-card"
      className="relative mx-auto flex w-full flex-1 min-h-0 max-w-3xl"
      data-caption-id={captionId}
    >
      <div
        id="caption-card-stack"
        className="flex w-full flex-col items-center justify-center"
      >
        <div
          id="caption-card-active"
          className="flex w-full flex-col items-center justify-center gap-3 sm:gap-4 lg:gap-5"
        >
          <div
            id="caption-card-caption"
            className={`w-full cursor-pointer select-none text-center transition-opacity duration-300 ${
              isContentVisible ? "opacity-100" : "opacity-0"
            }`}
            onPointerCancel={handleTapPointerCancel}
            onPointerDown={(event) => handleTapPointerDown("caption", event)}
            onPointerUp={(event) => handleTapPointerUp("caption", event)}
          >
            <p className="text-xl font-semibold leading-tight text-[var(--foreground)] sm:text-2xl lg:text-[26px]">
              {content || "No caption text"}
            </p>
          </div>
          {imageSrc ? (
            <div
              id="caption-card-image-frame"
              className="relative flex w-full cursor-pointer select-none overflow-hidden rounded-2xl border border-[var(--card-border)] bg-[var(--card-surface)] shadow-inner"
              onPointerCancel={handleTapPointerCancel}
              onPointerDown={(event) => handleTapPointerDown("image", event)}
              onPointerUp={(event) => handleTapPointerUp("image", event)}
              ref={containerRef}
              style={cardStyle}
            >
              <div
                id="caption-card-skeleton"
                className={`pointer-events-none absolute inset-0 overflow-hidden bg-[var(--surface-muted)] transition-opacity duration-300 ${
                  isContentVisible ? "opacity-0" : "opacity-100"
                }`}
                aria-hidden
              >
                <div className="skeleton-shine absolute inset-0" />
              </div>
              {displaySrc ? (
                <img
                  key={displaySrc}
                  ref={imageRef}
                  src={displaySrc}
                  srcSet={displaySrcSet}
                  sizes={displaySizes}
                  alt="Caption related"
                  fetchPriority="high"
                  loading="eager"
                  className={`absolute inset-0 h-full w-full object-contain transition-opacity duration-300 ${
                    isContentVisible ? "opacity-100" : "opacity-0"
                  }`}
                  onLoad={(event) => {
                    const img = event.currentTarget;
                    if (img.naturalWidth && img.naturalHeight) {
                      setImageRatio(img.naturalHeight / img.naturalWidth);
                    }
                    setLoadedImageSrc(displaySrc ?? img.currentSrc);
                  }}
                  onError={handleImageError}
                />
              ) : null}
            </div>
          ) : null}
          {actionRow ? (
            <div
              id="caption-card-actions"
              className={`w-full transition-opacity duration-300 ${
                isContentVisible ? "opacity-100" : "opacity-0"
              }`}
            >
              {actionRow}
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
