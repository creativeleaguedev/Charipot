import React, { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { useToast } from "@/components/ui/use-toast";
import { fmtUSD, fmtNum } from "@/lib/configRegistry";
import { Ticket, Hash } from "lucide-react";

// Immediate, audited editing of the two core ticket parameters:
//   • ticket_price — price of each ticket (USD)
//   • draw_target  — total number of tickets that trigger a draw
// Changes apply instantly to the ConfigParameter (no PCR timelock) and are
// written to the AuditLog so there is always a record of who changed what.
export default function LotterySettingsPanel({ user }) {
  const [params, setParams] = useState(null);
  const [priceDraft, setPriceDraft] = useState("");
  const [targetDraft, setTargetDraft] = useState("");
  const [saving, setSaving] = useState(false);
  const { toast } = useToast();

  const load = async () => {
    const list = await base44.entities.ConfigParameter.filter({ category: "lottery" });
    const byKey = {};
    list.forEach((p) => { byKey[p.key] = p; });
    setParams(byKey);
    setPriceDraft(String(byKey.ticket_price?.value ?? ""));
    setTargetDraft(String(byKey.draw_target?.value ?? ""));
  };
  useEffect(() => { load(); }, []);

  const save = async () => {
    const priceParam = params?.ticket_price;
    const targetParam = params?.draw_target;
    if (!priceParam || !targetParam) return;
    const price = Number(priceDraft);
    const target = Math.round(Number(targetDraft));
    if (!Number.isFinite(price) || price < priceParam.min || price > priceParam.max) {
      return toast({ title: "Invalid ticket price", description: `Must be between ${priceParam.min} and ${priceParam.max} ${priceParam.unit}.`, variant: "destructive" });
    }
    if (!Number.isFinite(target) || target < targetParam.min || target > targetParam.max) {
      return toast({ title: "Invalid ticket target", description: `Must be between ${fmtNum(targetParam.min)} and ${fmtNum(targetParam.max)} ${targetParam.unit}.`, variant: "destructive" });
    }
    const priceChanged = price !== priceParam.value;
    const targetChanged = target !== targetParam.value;
    if (!priceChanged && !targetChanged) {
      return toast({ title: "No changes", description: "Values are already at the entered amounts." });
    }
    setSaving(true);
    try {
      const now = new Date().toISOString();
      const actor = user?.full_name || user?.email || "Lottery Admin";
      if (priceChanged) {
        await base44.entities.ConfigParameter.update(priceParam.id, { value: +price, lastUpdatedBy: actor, lastUpdatedAt: now });
      }
      if (targetChanged) {
        await base44.entities.ConfigParameter.update(targetParam.id, { value: target, lastUpdatedBy: actor, lastUpdatedAt: now });
      }
      const parts = [];
      if (priceChanged) parts.push(`ticket price ${fmtUSD(priceParam.value)} → ${fmtUSD(price)}`);
      if (targetChanged) parts.push(`ticket target ${fmtNum(targetParam.value)} → ${fmtNum(target)}`);
      await base44.entities.AuditLog.create({
        actor, actorRole: "lottery_admin", action: "LOTTERY_SETTINGS_CHANGED",
        entityType: "ConfigParameter", details: parts.join("; "),
        timestamp: now, severity: "warning",
      });
      await load();
      toast({ title: "Lottery settings updated", description: parts.join("; ") });
    } catch (e) {
      toast({ title: "Update failed", description: e.message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  if (!params) {
    return <div className="flex h-40 items-center justify-center"><div className="h-7 w-7 animate-spin rounded-full border-4 border-muted border-t-primary" /></div>;
  }

  const priceParam = params.ticket_price;
  const targetParam = params.draw_target;

  return (
    <div className="space-y-5">
      <p className="text-sm text-muted-foreground">Set the price of each ticket and the total number of tickets that trigger a draw. Changes apply immediately and are recorded in the audit log.</p>
      <div className="rounded-2xl border border-border bg-card p-6 shadow-sm">
        <div className="grid gap-5 sm:grid-cols-2">
          <div className="rounded-xl border border-border bg-muted/30 p-4">
            <div className="flex items-center gap-2">
              <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-accent/15 text-accent"><Ticket className="h-5 w-5" /></div>
              <div>
                <p className="text-sm font-bold">Ticket Price</p>
                <p className="text-[11px] text-muted-foreground">Charged per ticket at purchase</p>
              </div>
            </div>
            <label className="mt-4 block text-[11px] font-medium text-muted-foreground">Price per ticket (USD)</label>
            <input type="number" min={priceParam.min} max={priceParam.max} step="0.01" value={priceDraft} onChange={(e) => setPriceDraft(e.target.value)} className="mt-1 w-full rounded-lg border border-input bg-background px-3 py-2 text-sm outline-none focus:border-primary focus:ring-1 focus:ring-primary" />
            <p className="mt-1 text-[11px] text-muted-foreground">Range: {fmtUSD(priceParam.min)} – {fmtUSD(priceParam.max)} · currently <b className="text-accent">{fmtUSD(priceParam.value)}</b></p>
          </div>
          <div className="rounded-xl border border-border bg-muted/30 p-4">
            <div className="flex items-center gap-2">
              <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/15 text-primary"><Hash className="h-5 w-5" /></div>
              <div>
                <p className="text-sm font-bold">Total Tickets per Draw</p>
                <p className="text-[11px] text-muted-foreground">Target ticket count that triggers a draw</p>
              </div>
            </div>
            <label className="mt-4 block text-[11px] font-medium text-muted-foreground">Ticket target</label>
            <input type="number" min={targetParam.min} max={targetParam.max} step="1" value={targetDraft} onChange={(e) => setTargetDraft(e.target.value)} className="mt-1 w-full rounded-lg border border-input bg-background px-3 py-2 text-sm outline-none focus:border-primary focus:ring-1 focus:ring-primary" />
            <p className="mt-1 text-[11px] text-muted-foreground">Range: {fmtNum(targetParam.min)} – {fmtNum(targetParam.max)} · currently <b className="text-accent">{fmtNum(targetParam.value)}</b></p>
          </div>
        </div>
        <div className="mt-5 flex justify-end">
          <button onClick={save} disabled={saving} className="inline-flex items-center gap-1.5 rounded-lg bg-gold-gradient px-5 py-2 text-sm font-semibold text-foreground hover:opacity-90 disabled:opacity-50">
            {saving ? "Saving…" : "Save changes"}
          </button>
        </div>
      </div>
    </div>
  );
}