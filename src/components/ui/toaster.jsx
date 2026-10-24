import { useToast } from "@/components/ui/use-toast";
import {
  Toast,
  ToastClose,
  ToastDescription,
  ToastProvider,
  ToastTitle,
  ToastViewport,
} from "@/components/ui/toast";
import { CheckCircle2, AlertCircle, Info, Loader2 } from "lucide-react";

const ICONS = {
  default: { Icon: Info, ring: "rgb(59 130 246)", glow: "rgba(59,130,246,0.55)" },
  success: { Icon: CheckCircle2, ring: "rgb(16 185 129)", glow: "rgba(16,185,129,0.6)" },
  destructive: { Icon: AlertCircle, ring: "rgb(239 68 68)", glow: "rgba(239,68,68,0.6)" },
  loading: { Icon: Loader2, ring: "rgb(245 158 11)", glow: "rgba(245,158,11,0.6)" },
};

function StatusBadge({ variant }) {
  const { Icon, ring, glow } = ICONS[variant] || ICONS.default;
  return (
    <span
      className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[#0d0d0d]"
      style={{ boxShadow: `0 0 0 1.5px ${ring}, 0 0 14px ${glow}` }}
    >
      <Icon
        className="h-4 w-4"
        style={{ color: ring, ...(variant === "loading" ? { animation: "spin 1s linear infinite" } : {}) }}
      />
    </span>
  );
}

export function Toaster() {
  const { toasts } = useToast();

  return (
    <ToastProvider duration={2000}>
      {toasts.map(function ({ id, title, description, action, variant, ...props }) {
        return (
          <Toast key={id} variant={variant} {...props}>
            <StatusBadge variant={variant} />
            <div className="grid flex-1 gap-0.5 py-0.5">
              {title && <ToastTitle>{title}</ToastTitle>}
              {description && <ToastDescription>{description}</ToastDescription>}
            </div>
            {action}
            <ToastClose />
          </Toast>
        );
      })}
      <ToastViewport />
    </ToastProvider>
  );
}