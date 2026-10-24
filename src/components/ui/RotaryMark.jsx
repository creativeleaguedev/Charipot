import React from "react";
import { cn } from "@/lib/utils";

// The Rotary gear-wheel brand mark — the same path used in the sidebar and
// public header logos, extracted here so decorative brand-mark spots across
// the app can reuse it instead of a generic icon.
export default function RotaryMark({ className, style }) {
  return (
    <svg viewBox="0 0 24 24" className={cn("fill-current", className)} style={style} aria-hidden="true">
      <path d="M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20zm0 2a8 8 0 0 1 8 8h-3.2A4.8 4.8 0 0 0 12 7.2V4zm-1.6.2v3A4.8 4.8 0 0 0 6.4 12H4a8 8 0 0 1 6.4-7.8zM4 13.6h2.4A4.8 4.8 0 0 0 10.4 17v3A8 8 0 0 1 4 13.6zM13.6 20v-3a4.8 4.8 0 0 0 4-3.4H20A8 8 0 0 1 13.6 20z" />
    </svg>
  );
}