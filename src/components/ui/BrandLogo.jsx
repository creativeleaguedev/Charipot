import React from "react";
import { cn } from "@/lib/utils";
import { Image } from "@/components/ui/image";

const LOGO_URL = "https://media.base44.com/images/public/6a9fd1112d3233a0a31bca58/2bbe355b5_image.png";

// ChariPot brand logo. Rendered as a circular badge so the square white
// margin around the black logo disc is clipped away, leaving the cyan/gold
// mark visible and consistent on both light and dark surfaces.
export default function BrandLogo({ className, height = 40 }) {
  return (
    <div
      style={{ height, width: height }}
      className={cn("relative shrink-0 overflow-hidden rounded-full ring-1 ring-black/5", className)}
    >
      <Image
        src={LOGO_URL}
        alt="Charipot Charity Program"
        fittingType="fill"
        className="h-full w-full object-cover"
      />
    </div>
  );
}