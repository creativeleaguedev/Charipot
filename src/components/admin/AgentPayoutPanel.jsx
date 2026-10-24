import React, { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { fmtUSD, fmtNum } from "@/lib/configRegistry";
import { useToast } from "@/components/ui/use-toast";
import { Banknote, Loader2, Send, RefreshCw, ExternalLink, AlertTriangle } from "lucide-react";
import { cn } from "@/lib/utils";

// Admin Agent Payout panel. Lists every agent wallet with its accrued referral
// earnings (the 2% agent fee share — ticket referrals + the 2% pass-purchase
// bonus) and the portion already paid out. The payable balance is the live
// source of truth: totalReferralEarnings - referralPaidOut. Clicking Pay sends
// that amount on-chain to the agent's wallet via the payAgentReferral function.
export default function AgentPayoutPanel({ user }) {
  const { toast } = useToast();
  const [agents, setAgents] = useState([]);
  const [feeWallet, setFeeWallet] = useState(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(null);
  const [refreshing, setRefreshing] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      // All agent wallets (isAgent true) plus the house wallet that accrues the
      // 2% pass-purchase bonus. Fetch a wide page so no agent is dropped.
      const all = await base44.entities.Wallet.list("-totalReferralEarnings", 500);
      const list = all.filter((w) => w.isAgent || (w.totalReferralEarnings || 0) > 0);
      setAgents(list);
      // Agent fee platform wallet (custody balance shown for context).
      try {
        const pw = await base44.entities.PlatformWallet.filter({ key: "agent_fee" });
        setFeeWallet(pw[0] || null);
      } catch (_) { setFeeWallet(null); }
    } catch (e) {
      toast({ title: "Failed to load agents", description: e.message, variant: "destructive" });
    }
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const refresh = async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  };

  const payable = (w) => +((w.totalReferralEarnings || 0) - (w.referralPaidOut || 0)).toFixed(2);

  const totalPayable = agents.reduce((s, w) => s + payable(w), 0);

  const pay = async (w) => {
    setBusy(w.id);
    try {
      const res = await base44.functions.invoke("payAgentReferral", { walletId: w.id });
      const d = res.data;
      if (d?.error) {
        toast({ title: "Payout failed", description: d.message || d.error, variant: "destructive" });
      } else {
        toast({ title: "Referral payout sent", description: `${fmtUSD(d.amount)} USDC to ${w.fullName || "agent"}. Tx: ${(d.paidTxHash || "").slice(0, 14)}…` });
        await load();
      }
    } catch (e) {
      toast({ title: "Payout failed", description: e.message, variant: "destructive" });
    } finally {
      setBusy(null);
    }
  };

  const payAll = async () => {
    const eligible = agents.filter((w) => payable(w) > 0 && w.walletAddress);
    if (eligible.length === 0) { toast({ title: "No agents with a payable balance" }); return; }
    setBusy("all");
    let ok = 0, fail = 0;
    for (const w of eligible) {
      try {
        const res = await base44.functions.invoke("payAgentReferral", { walletId: w.id });
        if (res.data?.error) fail++; else ok++;
      } catch (_) { fail++; }
    }
    await load();
    setBusy(null);
    toast({ title: "Batch payout complete", description: `${ok} paid, ${fail} failed.` });
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Banknote className="h-5 w-5 text-accent" />
          <h2 className="text-lg font-bold">Agent Referral Payouts</h2>
          <span className="text-xs text-muted-foreground">Pay accrued referral earnings (2% agent fee) to agents' wallets</span>
        </div>
        <button onClick={refresh} className="inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-2 text-sm font-medium hover:bg-muted">
          <RefreshCw className={cn("h-4 w-4", refreshing && "animate-spin")} /> Refresh
        </button>
      </div>

      {/* Summary cards */}
      <div className="grid gap-4 sm:grid-cols-3">
        <div className="rounded-2xl border border-border bg-card p-5 shadow-sm">
          <p className="text-xs text-muted-foreground">Total payable to agents</p>
          <p className="mt-1 text-xl font-bold text-accent">{fmtUSD(totalPayable)}</p>
        </div>
        <div className="rounded-2xl border border-border bg-card p-5 shadow-sm">
          <p className="text-xs text-muted-foreground">Agents with balance</p>
          <p className="mt-1 text-xl font-bold">{fmtNum(agents.filter((w) => payable(w) > 0).length)}</p>
        </div>
        <div className="rounded-2xl border border-border bg-card p-5 shadow-sm">
          <p className="text-xs text-muted-foreground">Agent fee wallet (on-chain custody)</p>
          <p className="mt-1 text-sm font-bold truncate">{feeWallet?.address ? `${feeWallet.address.slice(0, 8)}…${feeWallet.address.slice(-6)}` : "—"}</p>
          <p className="text-[11px] text-muted-foreground">Ledger: {fmtUSD(feeWallet?.ledgerBalance || 0)}</p>
        </div>
      </div>

      {totalPayable > 0 && (
        <div className="flex justify-end">
          <button onClick={payAll} disabled={busy === "all"} className="inline-flex items-center gap-1.5 rounded-lg bg-gold-gradient px-4 py-2 text-sm font-semibold text-foreground hover:opacity-90 disabled:opacity-50">
            {busy === "all" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />} Pay all eligible ({fmtUSD(totalPayable)})
          </button>
        </div>
      )}

      {loading ? (
        <div className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> Loading agents…</div>
      ) : agents.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border bg-card p-8 text-center text-sm text-muted-foreground">No agents with referral earnings yet.</div>
      ) : (
        <div className="rounded-2xl border border-border bg-card p-6 shadow-sm">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="text-[11px] uppercase tracking-wide text-muted-foreground">
                <tr className="border-b border-border">
                  <th className="py-2 pr-3">Agent</th>
                  <th className="py-2 pr-3">Code</th>
                  <th className="py-2 pr-3">Wallet address</th>
                  <th className="py-2 pr-3 text-right">Accrued</th>
                  <th className="py-2 pr-3 text-right">Paid out</th>
                  <th className="py-2 pr-3 text-right">Payable</th>
                  <th className="py-2 text-right">Action</th>
                </tr>
              </thead>
              <tbody>
                {agents.map((w) => {
                  const p = payable(w);
                  const noAddress = !w.walletAddress;
                  return (
                    <tr key={w.id} className="border-b border-border/60">
                      <td className="py-2.5 pr-3">
                        <p className="font-medium">{w.fullName || "—"}</p>
                        <p className="text-[10px] text-muted-foreground">{w.agentTier || "standard"}</p>
                      </td>
                      <td className="py-2.5 pr-3 font-mono text-xs">{w.agentCode || "—"}</td>
                      <td className="py-2.5 pr-3">
                        {w.walletAddress ? (
                          <a href={`https://bscscan.com/address/${w.walletAddress}`} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-xs text-primary hover:underline">
                            {w.walletAddress.slice(0, 8)}…{w.walletAddress.slice(-6)} <ExternalLink className="h-3 w-3" />
                          </a>
                        ) : <span className="text-xs text-muted-foreground">No wallet</span>}
                      </td>
                      <td className="py-2.5 pr-3 text-right font-medium">{fmtUSD(w.totalReferralEarnings || 0)}</td>
                      <td className="py-2.5 pr-3 text-right text-muted-foreground">{fmtUSD(w.referralPaidOut || 0)}</td>
                      <td className="py-2.5 pr-3 text-right font-bold text-accent">{fmtUSD(p)}</td>
                      <td className="py-2.5 text-right">
                        {p <= 0 ? (
                          <span className="text-xs text-muted-foreground">Settled</span>
                        ) : noAddress ? (
                          <span className="inline-flex items-center gap-1 text-xs text-amber-600"><AlertTriangle className="h-3 w-3" /> No address</span>
                        ) : (
                          <button onClick={() => pay(w)} disabled={busy === w.id || busy === "all"} className="inline-flex items-center gap-1 rounded-lg bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground hover:bg-primary/90 disabled:opacity-50">
                            {busy === w.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />} Pay {fmtUSD(p)}
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}