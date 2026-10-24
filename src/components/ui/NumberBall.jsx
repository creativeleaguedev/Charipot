import React from "react";
import { cn } from "@/lib/utils";

export default function NumberBall({ n, size = "md", variant = "gold" }) {
  const sizes = {
    sm: "h-8 w-8 text-sm",
    md: "h-11 w-11 text-base",
    lg: "h-14 w-14 text-xl",
  };
  const ball = variant === "navy" ? "number-ball-navy" : variant === "green" ? "number-ball-green" : "number-ball";
  const label = n != null ? String(n).padStart(2, "0") : "??";
  return (
    <div className={cn("flex items-center justify-center rounded-full font-bold text-white", ball, sizes[size])}>
      {label}
    </div>
  );
}