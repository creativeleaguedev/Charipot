import React, { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import { Tag, Loader2 } from "lucide-react";
import { fmtNum } from "@/lib/configRegistry";
import PassPurchaseList from "./PassPurchaseList";

export default function PassPackagesModal({ trigger }) {
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const me = await base44.auth.me();
      if (!me) return;
      const list = await base44.entities.PassPurchase.filter({ userId: me.id });
      list.sort((a, b) => new Date(b.purchasedAt || 0) - new Date(a.purchasedAt || 0));
      setItems(list);
    } catch (_) { /* ignore */ }
    setLoading(false);
  };

  useEffect(() => { if (open) load(); }, [open]);

  const activeCount = items.filter((p) => p.status === "active" && (p.remaining || 0) > 0).reduce((s, p) => s + (p.remaining || 0), 0);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Tag className="h-5 w-5 text-primary" /> My Pass Packages
          </DialogTitle>
        </DialogHeader>
        {loading ? (
          <div className="flex h-32 items-center justify-center">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : items.length === 0 ? (
          <p className="py-8 text-center text-sm text-muted-foreground">
            You haven't bought any pass packages yet.
          </p>
        ) : (
          <>
            <p className="text-xs text-muted-foreground">
              <b className="text-foreground">{fmtNum(activeCount)}</b> unused passes across {fmtNum(items.length)} packages.
            </p>
            <div className="max-h-[60vh] overflow-y-auto pr-1">
              <PassPurchaseList items={items} />
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}