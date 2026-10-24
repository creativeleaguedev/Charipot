import React, { useEffect, useState } from "react";
import { cn } from "@/lib/utils";

// Auto-sliding image carousel for a project's media gallery.
// `images` is an array of public image URLs. Renders nothing fancy when 0–1 images.
export default function ImageCarousel({ images, className, intervalMs = 3500 }) {
  const list = (images || []).filter(Boolean);
  const [idx, setIdx] = useState(0);

  useEffect(() => {
    if (list.length <= 1) return;
    const t = setInterval(() => setIdx((i) => (i + 1) % list.length), intervalMs);
    return () => clearInterval(t);
  }, [list.length, intervalMs]);

  // Keep idx in range if the list shrinks.
  useEffect(() => { if (idx > list.length - 1) setIdx(0); }, [list.length, idx]);

  if (list.length === 0) {
    return <div className={cn("flex items-center justify-center bg-muted text-xs text-muted-foreground", className)}>No images</div>;
  }

  return (
    <div className={cn("relative overflow-hidden", className)}>
      <div key={idx} className="absolute inset-0 animate-in fade-in duration-700">
        {/* Full-resolution image (no re-encoding/resizing) so impact photos stay sharp. */}
        <img src={list[idx]} alt="" className="h-full w-full object-cover" loading="lazy" />
      </div>
      {list.length > 1 && (
        <>
          <div className="absolute bottom-2 left-1/2 flex -translate-x-1/2 gap-1.5">
            {list.map((_, i) => (
              <button
                key={i}
                type="button"
                onClick={() => setIdx(i)}
                className={cn("h-1.5 rounded-full transition-all", i === idx ? "w-5 bg-white" : "w-1.5 bg-white/60 hover:bg-white/90")}
                aria-label={`Go to image ${i + 1}`}
              />
            ))}
          </div>
          <div className="absolute right-2 top-2 rounded-full bg-black/50 px-2 py-0.5 text-[10px] font-medium text-white">
            {idx + 1} / {list.length}
          </div>
        </>
      )}
    </div>
  );
}