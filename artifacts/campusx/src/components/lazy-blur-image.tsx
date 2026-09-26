import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";

interface LazyBlurImageProps {
  src: string;
  blurDataUrl?: string | null;
  alt: string;
  className?: string;
  imageClassName?: string;
}

export function LazyBlurImage({ src, blurDataUrl, alt, className, imageClassName }: LazyBlurImageProps) {
  const wrapperRef = useRef<HTMLDivElement>(null);
  const [nearViewport, setNearViewport] = useState(false);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    setLoaded(false);
    setNearViewport(false);
  }, [src]);

  useEffect(() => {
    const node = wrapperRef.current;
    if (!node || nearViewport) return;
    if (!("IntersectionObserver" in window)) {
      setNearViewport(true);
      return;
    }
    const observer = new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting) {
        setNearViewport(true);
        observer.disconnect();
      }
    }, { rootMargin: "300px" });
    observer.observe(node);
    return () => observer.disconnect();
  }, [nearViewport]);

  return (
    <div ref={wrapperRef} className={cn("relative overflow-hidden", className)}>
      {!loaded && blurDataUrl && (
        <img src={blurDataUrl} alt="" aria-hidden="true" className="absolute inset-0 h-full w-full scale-105 object-cover blur-lg" />
      )}
      {nearViewport && (
        <img
          src={src}
          alt={alt}
          loading="lazy"
          onLoad={() => setLoaded(true)}
          onError={() => { if (!blurDataUrl) setLoaded(true); }}
          className={cn("relative h-auto w-full object-cover transition-opacity duration-300", loaded ? "opacity-100" : "opacity-0", imageClassName)}
        />
      )}
    </div>
  );
}