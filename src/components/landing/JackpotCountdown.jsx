import React, { useEffect, useState } from "react";

// Live countdown to the next draw. Renders D : H : M : S cells on the dark
// jackpot card; returns nothing when no target datetime is supplied.
function remaining(target) {
  const ms = Math.max(0, new Date(target).getTime() - Date.now());
  const s = Math.floor(ms / 1000);
  return {
    d: Math.floor(s / 86400),
    h: Math.floor((s % 86400) / 3600),
    m: Math.floor((s % 3600) / 60),
    s: s % 60,
  };
}

const pad = (n) => String(n).padStart(2, "0");

export default function JackpotCountdown({ target }) {
  const [left, setLeft] = useState(() => (target ? remaining(target) : null));

  useEffect(() => {
    if (!target) {
      setLeft(null);
      return;
    }
    setLeft(remaining(target));
    const id = setInterval(() => setLeft(remaining(target)), 1000);
    return () => clearInterval(id);
  }, [target]);

  if (!target || !left) return null;

  const cells = [
    { v: left.d, l: "Days" },
    { v: left.h, l: "Hours" },
    { v: left.m, l: "Mins" },
    { v: left.s, l: "Secs" },
  ];

  return (
    <div className="flex items-center justify-center gap-1.5">
      {cells.map((c, i) => (
        <React.Fragment key={c.l}>
          {i > 0 && <span className="text-white/30">:</span>}
          <div className="min-w-[46px] rounded-lg bg-white/10 px-2 py-1.5 text-center">
            <div className="text-lg font-bold leading-none tabular-nums text-white">{pad(c.v)}</div>
            <div className="mt-1 text-[9px] uppercase tracking-wider text-white/50">{c.l}</div>
          </div>
        </React.Fragment>
      ))}
    </div>
  );
}