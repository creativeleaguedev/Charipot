import React, { useState } from "react";
import { cn } from "@/lib/utils";

// Renders a crypto/network logo from CoinGecko's CDN, with a colored-dot
// fallback if the image fails to load.
export default function CryptoLogo({ src, alt, color, className }) {
  const [err, setErr] = useState(false);
  if (err || !src) {
    return (
      <span
        className={cn("inline-block rounded-full", className)}
        style={{ background: color || "#94a3b8" }}
        role="img"
        aria-label={alt}
      />
    );
  }
  return (
    <img
      src={src}
      alt={alt}
      loading="lazy"
      onError={() => setErr(true)}
      className={cn("rounded-full object-cover bg-white", className)}
    />
  );
}