import React, { forwardRef } from "react";
import { cn } from "@/lib/utils";

const VARIANTS = {
  default: "border border-border bg-transparent text-foreground",
  outline: "border-2 border-border bg-transparent text-foreground",
  filled: "border border-transparent bg-muted text-foreground",
  ghost: "border border-transparent bg-transparent text-foreground",
};

const SIZES = {
  sm: "h-9 px-3 text-xs",
  default: "h-11 px-4 text-sm",
  lg: "h-14 px-5 text-base",
};

/**
 * InteractiveInput — an input with an animated text shimmer sweep and optional glow.
 * All effect knobs are props (see InteractiveInputDemo usage).
 */
const InteractiveInput = forwardRef(function InteractiveInput(
  {
    className,
    variant = "default",
    inputSize = "sm",
    glow = true,
    rounded = "custom",
    hideAnimations = false,
    uppercase = false,
    textEffect = "shimmer",
    shimmerColor = "#F5C542",
    shimmerSize = "0.15em",
    shimmerDuration = "3s",
    borderRadius = "9999px",
    background = "hsl(var(--card))",
    placeholder,
    value,
    onChange,
    disabled,
    type = "text",
    ...props
  },
  ref
) {
  const animate = !hideAnimations && textEffect === "shimmer";
  const keyframeId = React.useId().replace(/[:]/g, "");
  const shimmerName = `ix-shimmer-${keyframeId}`;
  const glowName = `ix-glow-${keyframeId}`;

  // The gold shimmer is applied as a border glow only — never as a transparent
  // text clip, which would make typed values invisible. Typed text always uses
  // the --foreground token (dark on a light field, light on a dark field) so it
  // stays readable while entering, and the placeholder stays a visible muted tone.
  const styleEl = glow ? (
    <style>{`
      @keyframes ${glowName} {
        0%, 100% { box-shadow: 0 0 6px 1px ${shimmerColor}55; }
        50% { box-shadow: 0 0 18px 4px ${shimmerColor}99; }
      }
    `}</style>
  ) : null;

  const shimmerStyle = {};

  const glowStyle = glow
    ? { animation: `${glowName} 2s ease-in-out infinite` }
    : {};

  return (
    <>
      {styleEl}
      <input
        ref={ref}
        type={type}
        value={value}
        onChange={onChange}
        disabled={disabled}
        placeholder={placeholder}
        className={cn(
          "w-full font-medium outline-none transition-colors placeholder:text-muted-foreground",
          "focus-visible:ring-2 focus-visible:ring-ring/40 disabled:cursor-not-allowed disabled:opacity-50",
          VARIANTS[variant] || VARIANTS.default,
          SIZES[inputSize] || SIZES.default,
          rounded === "custom" ? "" : "rounded-lg",
          uppercase ? "uppercase tracking-wide" : "",
          className
        )}
        style={{
          ...(borderRadius ? { borderRadius } : {}),
          ...(background ? { background } : {}),
          ...shimmerStyle,
          ...glowStyle,
        }}
        {...props}
      />
    </>
  );
});

export { InteractiveInput };
export default InteractiveInput;