import React, { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { fmtUSD } from "@/lib/configRegistry";
import { useToast } from "@/components/ui/use-toast";
import { cn } from "@/lib/utils";
import { BadgeCheck, X, Trophy, Ban, Send } from "lucide-react";

// Winning prizes are held as PrizePayout records (PENDING_VERIFICATION) after
// each draw. The admin verifies each winner, then releases the payout —
// blacklisted winners are blocked automatically by the verifyPayout function.
export default function PayoutPanel() {
  const [payouts, setPayouts] = useState([]);
  const [busy, setBusy] = useState(null);
  const { toast } = useToast();

  const load = async () => {
    const list = await base44.entities.PrizePayout.list("-createdAt", 200);
    list.sort((a, b) => {
      const rank = (p) => (p.status === "PENDING_VERIFICATION" ? 0 : 1);
      return rank(a) - rank(b);
    });
    setPayouts(list);
  };
  useEffect(() => { load(); }, []);

  const act = async (p, action) => {
    let reason = "";
    if (action === "reject") {
      reason = window.prompt("Reason for rejecting this payout?") || "Rejected by admin";
    }
    setBusy(p.id);
    try {
      const res = await base44.functions.invoke("verifyPayout", { payoutId: p.id, action, reason });
      const d = res.data;
      if (d?.error) {
        toast({ title: "Failed", description: d.error, variant: "destructive" });
      } else if (d?.blacklisted || d?.status === "BLACKLISTED") {
        toast({ title: "Payout blocked — winner blacklisted", description: `Draw #${p.drawNumber} · ${p.tier}`, variant: "destructive" });
      } else if (d?.status === "PAID") {
        toast({ title: "Prize released", description: `${fmtUSD(p.amount)} to ${p.fullName || "winner"}` });
      } else if (d?.status === "REJECTED") {
        toast({ title: "Payout rejected", description: reason });
      }
      load();
    } catch (e) {
      const detail = e?.response?.data?.message || e?.response?.data?.error || e.message;
      toast({ title: "Failed", description: detail, variant: "destructive" });
    } finally {
      setBusy(null);
    }
  };

  const distribute = async (p) => {
    const txHash = (window.prompt("Paste the on-chain multisig transaction hash that sent USDC from the matching custody wallet to the winner.") || "").trim();
    if (!txHash) return;
    setBusy(p.id);
    try {
      const res = await base44.functions.invoke("distributePrize", { payoutId: p.id, txHash });
      const d = res.data;
      if (d?.error) {
        toast({ title: "Distribution failed", description: d.message || d.error, variant: "destructive" });
      } else {
        toast({ title: "Prize distribution recorded", description: `${fmtUSD(d.amount)} ${d.token || "USDC"} multisig tx verified. Tx: ${(d.paidTxHash || "").slice(0, 12)}…` });
        load();
      }
    } catch (e) {
      const detail = e?.response?.data?.message || e?.response?.data?.error || e.message;
      toast({ title: "Distribution failed", description: detail, variant: "destructive" });
    } finally {
      setBusy(null);
    }
  };

  const pending = payouts.filter((p) => p.status === "PENDING_VERIFICATION");
  const others = payouts.filter((p) => p.status !== "PENDING_VERIFICATION");

  const statusStyle = (s) =>
    s === "PAID" ? "bg-emerald-100 text-emerald-700"
    : s === "REJECTED" ? "bg-red-100 text-red-700"
    : s === "BLACKLISTED" ? "bg-red-200 text-red-800"
    : s === "APPROVED" ? "bg-blue-100 text-blue-700"
    : "bg-amber-100 text-amber-700";

  const Row = ({ p }) => (
    <div className={cn("rounded-xl border p-4", p.status === "PENDING_VERIFICATION" ? "border-amber-300 bg-amber-50/40" : "border-border")}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="font-semibold">{p.fullName || p.userId}</p>
          <p className="text-xs text-muted-foreground">Draw #{p.drawNumber} · Ticket #{p.ticketNumber} · {p.tier}</p>
          <p className="text-[11px] text-muted-foreground">{p.walletAddress || "no wallet address"}</p>
          {p.rejectionReason && <p className="mt-1 text-[11px] font-semibold text-destructive">{p.rejectionReason}</p>}
          {p.reviewedBy && <p className="mt-1 text-[11px] text-muted-foreground">Reviewed by {p.reviewedBy}</p>}
        </div>
        <div className="flex flex-col items-end gap-2">
          <p className="text-lg font-bold text-accent">{fmtUSD(p.amount)}</p>
          <span className={cn("rounded-full px-2.5 py-0.5 text-[11px] font-semibold", statusStyle(p.status))}>{p.status.replace(/_/g, " ")}</span>
          {p.status === "PENDING_VERIFICATION" && (
            <div className="flex gap-2">
              <button onClick={() => act(p, "reject")} disabled={busy === p.id} className="inline-flex items-center gap-1.5 rounded-lg border border-red-200 bg-red-50 px-3 py-1.5 text-xs font-semibold text-red-600 hover:bg-red-100 disabled:opacity-50"><X className="h-4 w-4" /> Reject</button>
              <button onClick={() => act(p, "approve")} disabled={busy === p.id} className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-emerald-700 disabled:opacity-50"><BadgeCheck className="h-4 w-4" /> Verify & Release</button>
            </div>
          )}
          {p.status === "PAID" && !p.paidTxHash && (
            <button onClick={() => distribute(p)} disabled={busy === p.id} className="inline-flex items-center gap-1.5 rounded-lg bg-gold-gradient px-3 py-1.5 text-xs font-semibold text-foreground hover:opacity-90 disabled:opacity-50">
              {busy === p.id ? <span className="h-4 w-4 animate-spin rounded-full border-2 border-foreground/30 border-t-foreground" /> : <Send className="h-4 w-4" />} Record payout tx
            </button>
          )}
          {p.paidTxHash && (
            <a href={`https://bscscan.com/tx/${p.paidTxHash}`} target="_blank" rel="noreferrer" className="text-[10px] font-mono text-primary hover:underline">tx: {p.paidTxHash.slice(0, 14)}…</a>
          )}
        </div>
      </div>
    </div>
  );

  return (
    <div className="space-y-5">
      <p className="text-sm text-muted-foreground">Winning prizes are held for verification before distribution. Verify each winner, then release the payout — blacklisted winners are blocked automatically.</p>
      <div className="grid gap-4 sm:grid-cols-3">
        <div className="rounded-2xl border border-border bg-card p-5 shadow-sm"><Trophy className="h-5 w-5 text-accent" /><p className="mt-1 text-xs text-muted-foreground">Pending verification</p><p className="text-xl font-bold">{pending.length}</p></div>
        <div className="rounded-2xl border border-border bg-card p-5 shadow-sm"><BadgeCheck className="h-5 w-5 text-emerald-600" /><p className="mt-1 text-xs text-muted-foreground">Released</p><p className="text-xl font-bold">{payouts.filter((p) => p.status === "PAID").length}</p></div>
        <div className="rounded-2xl border border-border bg-card p-5 shadow-sm"><Ban className="h-5 w-5 text-destructive" /><p className="mt-1 text-xs text-muted-foreground">Blocked / Rejected</p><p className="text-xl font-bold">{payouts.filter((p) => p.status === "BLACKLISTED" || p.status === "REJECTED").length}</p></div>
      </div>

      <div className="rounded-2xl border border-border bg-card p-6 shadow-sm">
        <h2 className="text-lg font-bold">Pending Verification</h2>
        <div className="mt-4 space-y-3">
          {pending.length === 0 ? <p className="text-sm text-muted-foreground">No payouts awaiting verification. When a draw completes, each winning ticket appears here for review.</p> : pending.map((p) => <Row key={p.id} p={p} />)}
        </div>
      </div>

      {others.length > 0 && (
        <div className="rounded-2xl border border-border bg-card p-6 shadow-sm">
          <h2 className="text-lg font-bold">History</h2>
          <div className="mt-4 space-y-3">
            {others.map((p) => <Row key={p.id} p={p} />)}
          </div>
        </div>
      )}
    </div>
  );
}