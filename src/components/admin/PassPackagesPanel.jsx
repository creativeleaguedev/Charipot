import React, { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { useToast } from "@/components/ui/use-toast";
import { fmtUSD } from "@/lib/configRegistry";
import { cn } from "@/lib/utils";
import { Tag, Plus, Pencil, Trash2, X, GripVertical, Check } from "lucide-react";
import { InteractiveInput } from "@/components/ui/interactive-input";

const EMPTY = {
  label: "",
  amount: "",
  discount: "",
  passPrice: "",
  validityDays: "",
  bestValue: false,
  active: true,
  order: 0,
};

export default function PassPackagesPanel({ user }) {
  const [packages, setPackages] = useState([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(null); // {id?, ...fields}
  const [busy, setBusy] = useState(false);
  const { toast } = useToast();

  const load = async () => {
    setLoading(true);
    try {
      const list = await base44.entities.PassPackage.list("order", 100);
      setPackages(list || []);
    } catch (e) {
      toast({ title: "Failed to load packages", description: e.message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const openNew = () => setEditing({ ...EMPTY });
  const openEdit = (p) => setEditing({
    id: p.id,
    label: p.label || "",
    amount: String(p.amount ?? ""),
    discount: String(p.discount ?? ""),
    passPrice: String(p.passPrice ?? ""),
    validityDays: String(p.validityDays ?? ""),
    bestValue: !!p.bestValue,
    active: p.active !== false,
    order: p.order || 0,
  });

  const save = async () => {
    const e = editing;
    if (!e) return;
    const amount = Number(e.amount);
    const discount = Number(e.discount);
    if (!e.label.trim()) return toast({ title: "Label required", variant: "destructive" });
    if (!Number.isFinite(amount) || amount <= 0) return toast({ title: "Valid amount required", variant: "destructive" });
    if (!Number.isFinite(discount) || discount < 0 || discount > 100) return toast({ title: "Discount must be 0–100", variant: "destructive" });
    setBusy(true);
    try {
      const payload = {
        label: e.label.trim(),
        amount,
        discount,
        passPrice: Number(e.passPrice) || 0,
        validityDays: Number(e.validityDays) || 0,
        bestValue: !!e.bestValue,
        active: !!e.active,
        order: Number(e.order) || 0,
      };
      if (e.id) {
        await base44.entities.PassPackage.update(e.id, payload);
        await base44.entities.AuditLog.create({
          actor: user?.full_name || "Admin", actorRole: "admin", action: "PASS_PACKAGE_UPDATED",
          entityType: "PassPackage", entityId: e.id,
          details: `Updated ${payload.label}: ${fmtUSD(amount)} · ${discount}% off · valid ${payload.validityDays || 0}d · ${payload.active ? "active" : "inactive"}`,
          timestamp: new Date().toISOString(), severity: "info",
        });
        toast({ title: "Package updated", description: payload.label });
      } else {
        const created = await base44.entities.PassPackage.create(payload);
        await base44.entities.AuditLog.create({
          actor: user?.full_name || "Admin", actorRole: "admin", action: "PASS_PACKAGE_CREATED",
          entityType: "PassPackage", entityId: created.id,
          details: `Created ${payload.label}: ${fmtUSD(amount)} · ${discount}% off · valid ${payload.validityDays || 0}d`,
          timestamp: new Date().toISOString(), severity: "info",
        });
        toast({ title: "Package added", description: payload.label });
      }
      setEditing(null);
      load();
    } catch (err) {
      toast({ title: "Save failed", description: err.message, variant: "destructive" });
    } finally {
      setBusy(false);
    }
  };

  const toggleActive = async (p) => {
    await base44.entities.PassPackage.update(p.id, { active: !p.active });
    load();
    toast({ title: p.active ? "Package disabled" : "Package enabled", description: p.label });
  };

  const remove = async (p) => {
    if (!confirm(`Delete package "${p.label}"? This cannot be undone.`)) return;
    await base44.entities.PassPackage.delete(p.id);
    await base44.entities.AuditLog.create({
      actor: user?.full_name || "Admin", actorRole: "admin", action: "PASS_PACKAGE_DELETED",
      entityType: "PassPackage", entityId: p.id, details: `Deleted ${p.label}`,
      timestamp: new Date().toISOString(), severity: "warning",
    });
    load();
    toast({ title: "Package deleted", description: p.label });
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-muted-foreground">
          Manage the ticket-pass packages shown on the marketplace. Set the bundle price, discount %, per-pass price, validity, and add new packages at any time.
        </p>
        <button onClick={openNew} className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:bg-primary/90">
          <Plus className="h-4 w-4" /> Add package
        </button>
      </div>

      {loading ? (
        <div className="flex h-40 items-center justify-center"><div className="h-8 w-8 animate-spin rounded-full border-4 border-muted border-t-primary" /></div>
      ) : packages.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-border bg-muted/30 p-10 text-center text-sm text-muted-foreground">
          No pass packages yet. Click <b>Add package</b> to create your first one.
        </div>
      ) : (
        <div className="overflow-hidden rounded-2xl border border-border bg-card shadow-sm">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[760px] text-sm">
              <thead>
                <tr className="border-b border-border bg-muted/40 text-left text-[11px] uppercase tracking-wide text-muted-foreground">
                  <th className="px-4 py-3 font-semibold">Package</th>
                  <th className="px-4 py-3 text-right font-semibold">Amount</th>
                  <th className="px-4 py-3 text-right font-semibold">Discount</th>
                  <th className="px-4 py-3 text-right font-semibold">Pass price</th>
                  <th className="px-4 py-3 text-right font-semibold">Validity</th>
                  <th className="px-4 py-3 font-semibold">Status</th>
                  <th className="px-4 py-3 text-right font-semibold">Actions</th>
                </tr>
              </thead>
              <tbody>
                {packages.map((p) => (
                  <tr key={p.id} className="border-b border-border/60 hover:bg-muted/30">
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <GripVertical className="h-4 w-4 text-muted-foreground/50" />
                        <div>
                          <p className="font-semibold">{p.label}{p.bestValue && <span className="ml-2 rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-bold text-emerald-700">Best value</span>}</p>
                          <p className="text-[11px] text-muted-foreground">order {p.order || 0}</p>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-right font-semibold">{fmtUSD(p.amount)}</td>
                    <td className="px-4 py-3 text-right">
                      <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/15 px-2 py-0.5 text-[11px] font-bold text-emerald-700"><Tag className="h-3 w-3" />{p.discount}% off</span>
                    </td>
                    <td className="px-4 py-3 text-right">{p.passPrice > 0 ? fmtUSD(p.passPrice) : <span className="text-muted-foreground">Auto (derived)</span>}</td>
                    <td className="px-4 py-3 text-right">{p.validityDays > 0 ? `${p.validityDays} days` : <span className="text-muted-foreground">No expiry</span>}</td>
                    <td className="px-4 py-3">
                      <button onClick={() => toggleActive(p)} className={cn("rounded-full px-2.5 py-0.5 text-[11px] font-semibold", p.active !== false ? "bg-emerald-100 text-emerald-700" : "bg-muted text-muted-foreground")}>
                        {p.active !== false ? "Active" : "Inactive"}
                      </button>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex justify-end gap-1.5">
                        <button onClick={() => openEdit(p)} className="rounded-lg border border-border p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground"><Pencil className="h-4 w-4" /></button>
                        <button onClick={() => remove(p)} className="rounded-lg border border-border p-1.5 text-red-500 hover:bg-red-50"><Trash2 className="h-4 w-4" /></button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {editing && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={() => setEditing(null)}>
          <div className="w-full max-w-lg rounded-2xl bg-card p-6 shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-bold">{editing.id ? "Edit package" : "Add pass package"}</h2>
              <button onClick={() => setEditing(null)} className="rounded-lg p-1 text-muted-foreground hover:bg-muted"><X className="h-5 w-5" /></button>
            </div>
            <div className="mt-4 grid gap-4 sm:grid-cols-2">
              <div className="sm:col-span-2">
                <label className="text-xs font-medium text-muted-foreground">Package label</label>
                <InteractiveInput value={editing.label} onChange={(e) => setEditing({ ...editing, label: e.target.value })} placeholder="e.g. Starter Bundle" className="mt-1 w-full" />
              </div>
              <div>
                <label className="text-xs font-medium text-muted-foreground">Bundle amount (USD)</label>
                <InteractiveInput type="number" step="0.01" value={editing.amount} onChange={(e) => setEditing({ ...editing, amount: e.target.value })} placeholder="50" className="mt-1 w-full" />
              </div>
              <div>
                <label className="text-xs font-medium text-muted-foreground">Discount %</label>
                <InteractiveInput type="number" step="1" value={editing.discount} onChange={(e) => setEditing({ ...editing, discount: e.target.value })} placeholder="10" className="mt-1 w-full" />
              </div>
              <div>
                <label className="text-xs font-medium text-muted-foreground">Pass price (USD, optional)</label>
                <InteractiveInput type="number" step="0.0001" value={editing.passPrice} onChange={(e) => setEditing({ ...editing, passPrice: e.target.value })} placeholder="0 = derive from discount" className="mt-1 w-full" />
              </div>
              <div>
                <label className="text-xs font-medium text-muted-foreground">Validity (days)</label>
                <InteractiveInput type="number" step="1" value={editing.validityDays} onChange={(e) => setEditing({ ...editing, validityDays: e.target.value })} placeholder="0 = no expiry" className="mt-1 w-full" />
              </div>
              <div>
                <label className="text-xs font-medium text-muted-foreground">Display order</label>
                <InteractiveInput type="number" step="1" value={editing.order} onChange={(e) => setEditing({ ...editing, order: e.target.value })} placeholder="0" className="mt-1 w-full" />
              </div>
              <div className="flex items-center gap-6 sm:col-span-2">
                <label className="flex items-center gap-2 text-sm font-medium">
                  <input type="checkbox" checked={editing.bestValue} onChange={(e) => setEditing({ ...editing, bestValue: e.target.checked })} className="h-4 w-4 rounded border-input" />
                  Mark as Best value
                </label>
                <label className="flex items-center gap-2 text-sm font-medium">
                  <input type="checkbox" checked={editing.active} onChange={(e) => setEditing({ ...editing, active: e.target.checked })} className="h-4 w-4 rounded border-input" />
                  Active on marketplace
                </label>
              </div>
            </div>
            <div className="mt-6 flex gap-3">
              <button onClick={() => setEditing(null)} className="flex-1 rounded-lg border border-border py-2.5 text-sm font-semibold hover:bg-muted">Cancel</button>
              <button onClick={save} disabled={busy} className="flex-1 rounded-lg bg-primary py-2.5 text-sm font-semibold text-primary-foreground hover:bg-primary/90 disabled:opacity-50">
                {busy ? "Saving…" : editing.id ? "Save changes" : "Add package"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}