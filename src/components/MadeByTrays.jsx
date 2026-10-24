import React from "react";

// Tiny footer credit rendered at the very bottom of the Landing and Home pages.
// "Dev" links to the builder's profile site.
export default function MadeByTrays({ className = "" }) {
  return (
    <div className={`w-full text-center text-[11px] text-muted-foreground ${className}`}>
      Dev with <span aria-label="love" role="img">❤️</span> by{" "}
      <a
        href="https://blockdev.base44.app/"
        target="_blank"
        rel="noreferrer"
        className="font-semibold text-foreground underline-offset-2 hover:underline"
      >
        Trays
      </a>
    </div>
  );
}