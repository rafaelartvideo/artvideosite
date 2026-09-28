import { useEffect, useState } from "react";
import { findLogoVisibleBounds } from "./logo-visible-bounds.mjs";

type AutoFitLogoProps = {
  src: string;
  alt: string;
  className?: string;
};

const MAX_PROBE_DIMENSION = 512;
const CONTENT_PADDING_RATIO = 0.04;

export function AutoFitLogo({ src, alt, className }: AutoFitLogoProps) {
  const [displaySrc, setDisplaySrc] = useState(src);

  useEffect(() => {
    let cancelled = false;
    let generatedUrl: string | null = null;
    setDisplaySrc(src);

    const image = new Image();
    image.crossOrigin = "anonymous";
    image.decoding = "async";

    image.onload = () => {
      try {
        const naturalWidth = image.naturalWidth || image.width;
        const naturalHeight = image.naturalHeight || image.height;
        if (!naturalWidth || !naturalHeight) return;

        const scale = Math.min(1, MAX_PROBE_DIMENSION / Math.max(naturalWidth, naturalHeight));
        const probeWidth = Math.max(1, Math.round(naturalWidth * scale));
        const probeHeight = Math.max(1, Math.round(naturalHeight * scale));
        const probe = document.createElement("canvas");
        probe.width = probeWidth;
        probe.height = probeHeight;

        const context = probe.getContext("2d", { willReadFrequently: true });
        if (!context) return;
        context.drawImage(image, 0, 0, probeWidth, probeHeight);

        const pixels = context.getImageData(0, 0, probeWidth, probeHeight);
        const bounds = findLogoVisibleBounds({
          data: pixels.data,
          width: probeWidth,
          height: probeHeight,
        });
        if (!bounds) return;

        const visibleWidth = bounds.right - bounds.left + 1;
        const visibleHeight = bounds.bottom - bounds.top + 1;
        const horizontalTrim = 1 - visibleWidth / probeWidth;
        const verticalTrim = 1 - visibleHeight / probeHeight;

        if (horizontalTrim < 0.04 && verticalTrim < 0.04) return;

        const padding = Math.max(1, Math.round(Math.max(visibleWidth, visibleHeight) * CONTENT_PADDING_RATIO));
        const cropLeft = Math.max(0, bounds.left - padding);
        const cropTop = Math.max(0, bounds.top - padding);
        const cropRight = Math.min(probeWidth - 1, bounds.right + padding);
        const cropBottom = Math.min(probeHeight - 1, bounds.bottom + padding);
        const cropWidth = cropRight - cropLeft + 1;
        const cropHeight = cropBottom - cropTop + 1;

        const output = document.createElement("canvas");
        output.width = cropWidth;
        output.height = cropHeight;
        const outputContext = output.getContext("2d");
        if (!outputContext) return;

        outputContext.drawImage(
          probe,
          cropLeft,
          cropTop,
          cropWidth,
          cropHeight,
          0,
          0,
          cropWidth,
          cropHeight,
        );

        output.toBlob(blob => {
          if (!blob || cancelled) return;
          generatedUrl = URL.createObjectURL(blob);
          setDisplaySrc(generatedUrl);
        }, "image/png");
      } catch {
        // CORS or canvas restrictions can block pixel analysis. In that case,
        // keep the original logo instead of preventing it from rendering.
      }
    };

    image.src = src;

    return () => {
      cancelled = true;
      if (generatedUrl) URL.revokeObjectURL(generatedUrl);
    };
  }, [src]);

  return <img src={displaySrc} alt={alt} className={className} draggable={false} />;
}
