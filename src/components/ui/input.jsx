import * as React from "react";
import { InteractiveInput } from "@/components/ui/interactive-input";

// The app's shared input now renders InteractiveInput, so every page that uses
// <Input> gets the interactive shimmer + glow + pill styling. Callers can still
// pass any prop (className, type, value, onChange, …) and override any
// InteractiveInput knob (e.g. textEffect="normal") through props.
const Input = React.forwardRef(({ className, type, ...props }, ref) => {
  return (
    <InteractiveInput
      ref={ref}
      type={type}
      className={className}
      {...props}
    />
  );
});
Input.displayName = "Input";

export { Input };