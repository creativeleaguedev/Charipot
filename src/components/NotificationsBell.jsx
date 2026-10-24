import React, { useEffect, useRef, useState } from "react";
import { base44 } from "@/api/base44Client";
import { Bell, Check, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { useLang } from "@/lib/LanguageContext";

export default function NotificationsBell({ userId }) {
  const { t } = useLang();
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(false);
  const ref = useRef(null);

  const load = async () => {
    if (!userId) return;
    setLoading(true);
    try {
      const list = await base44.entities.Notification.filter({ userId }, "-created_date", 30);
      setItems(list);
    } catch (e) { console.error(e); }
    setLoading(false);
  };

  // Load on mount so the unread badge shows without opening the dropdown.
  useEffect(() => { load(); }, [userId]);

  // Live-update when any notification for this user changes.
  useEffect(() => {
    if (!userId) return;
    const unsub = base44.entities.Notification.subscribe(() => load());
    return unsub;
  }, [userId]);

  useEffect(() => {
    const onClick = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, []);

  const unread = items.filter((n) => !n.read).length;

  const markAllRead = async () => {
    const unreadItems = items.filter((n) => !n.read);
    if (!unreadItems.length) return;
    setItems(items.map((n) => ({ ...n, read: true })));
    try {
      await base44.entities.Notification.bulkUpdate(unreadItems.map((n) => ({ id: n.id, read: true })));
    } catch (e) { console.error(e); load(); }
  };

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen((v) => !v)}
        className="relative rounded-full border border-border bg-background p-1.5 hover:bg-muted sm:p-2"
        title={t("notify.title")}
      >
        <Bell className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
        {unread > 0 && (
          <span className="absolute -right-1 -top-1 flex min-w-[16px] items-center justify-center rounded-full bg-accent px-1 text-[10px] font-bold text-accent-foreground shadow">
            {unread > 9 ? "9+" : unread}
          </span>
        )}
      </button>
      {open && (
        <div className="absolute right-0 z-50 mt-2 w-80 max-w-[calc(100vw-2rem)] overflow-hidden rounded-xl border border-border bg-card shadow-xl">
          <div className="flex items-center justify-between border-b border-border px-4 py-2.5">
            <p className="text-sm font-semibold">{t("notify.title")}</p>
            <div className="flex items-center gap-1">
              {unread > 0 && (
                <button onClick={markAllRead} className="inline-flex items-center gap-1 rounded-lg px-2 py-1 text-xs text-muted-foreground hover:bg-muted">
                  <Check className="h-3 w-3" /> {t("notify.mark_read")}
                </button>
              )}
              <button onClick={() => setOpen(false)} className="rounded-lg p-1 text-muted-foreground hover:bg-muted">
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>
          <div className="max-h-80 overflow-y-auto">
            {loading ? (
              <div className="flex items-center justify-center py-8">
                <div className="h-6 w-6 animate-spin rounded-full border-2 border-muted border-t-primary" />
              </div>
            ) : items.length === 0 ? (
              <p className="py-8 text-center text-xs text-muted-foreground">{t("notify.empty")}</p>
            ) : (
              items.map((n) => (
                <div key={n.id} className={cn("border-b border-border/60 px-4 py-3", !n.read && "bg-accent/5")}>
                  <div className="flex items-start gap-2">
                    {!n.read && <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-accent" />}
                    <div className="min-w-0 flex-1">
                      <p className="text-xs font-semibold text-foreground">{n.title}</p>
                      <p className="mt-0.5 text-xs text-muted-foreground">{n.message}</p>
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}