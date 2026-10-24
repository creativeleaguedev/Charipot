import React, { useEffect, useRef } from "react";
import { Fuel, Coins, X } from "lucide-react";

// Prominent centered on-screen popup for payment failures (insufficient gas,
// insufficient ticket amount). Renders when `alert` is non-null, auto-dismisses
// after `duration` ms (default 7s), and calls onDismiss when cleared.
export default function PaymentAlertPopup({ alert, onDismiss, duration = 7000 }) {
  const timerRef = useRef(null);

  useEffect(() => {
    if (!alert) return;
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => onDismiss?.(), duration);
    return () => { if (timerRef.current) clearTimeout(timerRef.current); };
  }, [alert, duration, onDismiss]);

  if (!alert) return null;

  const isGas = alert.type === "gas";
  const Icon = isGas ? Fuel : Coins;
  const accent = isGas ? "neon-red" : "neon-gold";
  const ring = isGas ? "border-red-500" : "border-accent";
  const head = isGas ? "from-red-600 to-red-700" : "from-amber-500 to-amber-600";

  return (
    <div className="fixed left-1/2 top-24 z-[120] w-[calc(100%-2rem)] max-w-sm -translate-x-1/2 animate-in fade-in slide-in-from-top-4 duration-300">
      <div className={`overflow-hidden rounded-2xl border-2 ${ring} bg-card shadow-2xl ${accent}`}>
        <div className={`relative bg-gradient-to-r ${head} px-5 py-4 text-white`}>
          <button onClick={onDismiss} className="absolute right-3 top-3 rounded-md p-1 text-white/80 hover:bg-white/15 hover:text-white">
            <X className="h-4 w-4" />
          </button>
          <div className="flex items-center gap-2.5">
            <span className="flex h-9 w-9 items-center justify-center rounded-full bg-white/20 backdrop-blur">
              <Icon className="h-5 w-5" />
            </span>
            <div>
              <p className="text-base font-bold">{alert.title}</p>
              <p className="text-[11px] text-white/80">{alert.subtitle}</p>
            </div>
          </div>
        </div>
        <div className="p-5">
          <p className="text-sm text-foreground">{alert.message}</p>
          {alert.detail && (
            <div className="mt-3 rounded-lg bg-muted px-3 py-2 text-xs font-semibold text-muted-foreground">
              {alert.detail}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}