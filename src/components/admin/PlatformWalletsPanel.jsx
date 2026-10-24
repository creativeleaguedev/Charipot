import React, { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { fmtUSD } from "@/lib/configRegistry";
import { useToast } from "@/components/ui/use-toast";
import { Landmark, Save, ShieldCheck, Loader2, Eye, EyeOff, Zap, History, ArrowDownCircle } from "lucide-react";
import { cn } from "@/lib/utils";
import { InteractiveInput } from "@/components/ui/interactive-input";

const ADDR_RE = /^0x[a-fA-F0-9]{40}$/;
const DESTINATION_KEYS = ["charity", "jackpot_5", "winnings_4", "winnings_3", "buffer", "treasury", "agent_fee"];

// Admin-only panel for entering the on-chain custody address of each platform
// wallet. Addresses are validated as EVM (0x + 40 hex), masked by default, and
// every change is written to the audit log. PlatformWallet access is locked to
// admins via RLS, so only administrators can read or change these addresses.
export default function PlatformWalletsPanel({ user }) {
  const [wallets, setWallets] = useState([]);
  const [drafts, setDrafts] = useState({});
  const [busy, setBusy] = useState(null);
  const [reveal, setReveal] = useState({});
  const [rollDraft, setRollDraft] = useState("0");
  const [savingRoll, setSavingRoll] = useState(false);
  const [collector, setCollector] = useState(null);
  const [sweepHistory, setSweepHistory] = useState([]);
  const [sweeping, setSweeping] = useState(false);
  const { toast } = useToast();

  const load = async () => {
    const res = await base44.functions.invoke("managePlatformWallets", { action: "list" });
    const list = res.data?.wallets || [];
    setWallets(list);
    setCollector(res.data?.collector || null);
    setSweepHistory(res.data?.sweepHistory || []);
    const d = {};
    list.forEach((w) => { d[w.id] = w.address || ""; });
    setDrafts(d);
    const buf = list.find((w) => w.key === "buffer");
    setRollDraft(buf?.autoRolloverAmount != null ? String(buf.autoRolloverAmount) : "0");
  };
  useEffect(() => { load(); }, []);

  const sweepNow = async () => {
    setSweeping(true);
    try {
      const res = await base44.functions.invoke("sweepCollectorWallet", {});
      const d = res.data || {};
      if (d.swept) {
        toast({ title: `Sweep #${d.cycleNumber} completed`, description: `${fmtUSD(d.balance)} distributed to custody wallets. Allocations reset to $0.00.` });
      } else {
        toast({ title: "Threshold not reached", description: `Collector balance ${fmtUSD(d.balance)} is below the ${fmtUSD(d.threshold)} sweep threshold.` });
      }
      load();
    } catch (e) {
      toast({ title: "Sweep failed", description: e.message, variant: "destructive" });
    } finally { setSweeping(false); }
  };

  const save = async (w) => {
    const addr = (drafts[w.id] || "").trim();
    if (!ADDR_RE.test(addr)) {
      toast({ title: "Invalid address", description: "Enter a valid EVM address (0x followed by 40 hex characters).", variant: "destructive" });
      return;
    }
    setBusy(w.id);
    try {
      await base44.functions.invoke("managePlatformWallets", { action: "update", walletId: w.id, address: addr });
      load();
      toast({ title: "Address saved", description: `${w.label} custody address updated.` });
    } catch (e) {
      toast({ title: "Save failed", description: e.message, variant: "destructive" });
    } finally {
      setBusy(null);
    }
  };

  const saveRollover = async () => {
    const amt = Math.max(0, Number(rollDraft) || 0);
    setSavingRoll(true);
    try {
      await base44.functions.invoke("managePlatformWallets", { action: "setBufferRollover", amount: amt });
      load();
      toast({ title: "Auto-rollover saved", description: `$${amt.toFixed(2)} will roll from the Buffer wallet into the 5/5 Jackpot every draw.` });
    } catch (e) {
      toast({ title: "Save failed", description: e.message, variant: "destructive" });
    } finally { setSavingRoll(false); }
  };

  return (
    <div className="space-y-5">
      <div className="flex items-start gap-3 rounded-2xl border border-accent/30 bg-accent/5 p-4">
        <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-accent" />
        <div>
          <p className="text-sm font-semibold">Secure wallet address entry</p>
          <p className="text-xs text-muted-foreground">Enter the on-chain custody address for each platform wallet. Addresses are masked by default and only administrators can view or change them. Every update is recorded in the audit log.</p>
        </div>
      </div>

      {collector && (
        <div className="rounded-2xl border border-primary/40 bg-primary/5 p-5 shadow-sm">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="flex items-center gap-2.5">
              <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/15 text-primary"><Landmark className="h-5 w-5" /></div>
              <div>
                <p className="text-sm font-bold">Collector Wallet · Distribution Hub</p>
                <p className="text-[11px] text-muted-foreground">All ticket, pass & donation payments land here, then sweep to custody wallets at the threshold.</p>
              </div>
            </div>
            <span className={cn("rounded-full px-3 py-1 text-xs font-semibold", collector.ready ? "bg-emerald-100 text-emerald-700" : "bg-amber-100 text-amber-700")}>
              {collector.ready ? "Ready to sweep" : "Accumulating"}
            </span>
          </div>
          <div className="mt-4 grid gap-3 sm:grid-cols-4">
            <div className="rounded-xl border border-border bg-card p-3">
              <p className="text-[11px] text-muted-foreground">Current Balance (on-chain)</p>
              <p className="mt-0.5 text-lg font-bold">{fmtUSD(collector.balance)}</p>
              <p className="text-[10px] text-muted-foreground">{fmtUSD(collector.usdc)} USDC · {fmtUSD(collector.usdt)} USDT</p>
            </div>
            <div className="rounded-xl border border-border bg-card p-3">
              <p className="text-[11px] text-muted-foreground">Current Cycle Pending Allocation</p>
              <p className="mt-0.5 text-lg font-bold text-accent">{fmtUSD(collector.pendingAllocation)}</p>
              <p className="text-[10px] text-muted-foreground">Sum of custody wallets' "Allocated to Date"</p>
            </div>
            <div className="rounded-xl border border-border bg-card p-3">
              <p className="text-[11px] text-muted-foreground">Sweep Threshold</p>
              <p className="mt-0.5 text-lg font-bold">{fmtUSD(collector.threshold)}</p>
              <p className="text-[10px] text-muted-foreground">Triggers when USDC or USDT ≥ threshold</p>
            </div>
            <div className="flex items-center justify-center rounded-xl border border-border bg-card p-3">
              <button onClick={sweepNow} disabled={sweeping || !collector.ready} className={cn("inline-flex w-full items-center justify-center gap-1.5 rounded-lg px-4 py-2.5 text-sm font-semibold disabled:opacity-50", collector.ready ? "bg-primary text-primary-foreground hover:bg-primary/90" : "border border-border text-muted-foreground")}>
                {sweeping ? <Loader2 className="h-4 w-4 animate-spin" /> : <Zap className="h-4 w-4" />} Sweep now
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="space-y-3">
        {wallets.map((w) => {
          const changed = (drafts[w.id] || "") !== (w.address || "");
          const show = reveal[w.id];
          const valid = ADDR_RE.test((drafts[w.id] || "").trim());
          return (
            <div key={w.id} className="rounded-2xl border border-border bg-card p-4 shadow-sm">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="flex items-center gap-2.5">
                  <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10 text-primary"><Landmark className="h-5 w-5" /></div>
                  <div>
                    <p className="text-sm font-bold flex items-center gap-2">{w.label}
                      {w.isPublic
                        ? <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-semibold text-emerald-700">Public</span>
                        : <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] font-semibold text-muted-foreground">Private</span>}
                    </p>
                    <p className="text-[11px] text-muted-foreground">{w.description}</p>
                  </div>
                </div>
                <p className="text-xs text-muted-foreground">Ledger: <b className="text-foreground">{fmtUSD(w.ledgerBalance || 0)}</b></p>
              </div>

              <div className="mt-3">
                <label className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">On-chain custody address</label>
                <div className="mt-1 flex gap-2">
                  <InteractiveInput
                    type={show ? "text" : "password"}
                    value={drafts[w.id] || ""}
                    onChange={(e) => setDrafts({ ...drafts, [w.id]: e.target.value })}
                    placeholder="0x…"
                    className="flex-1 font-mono"
                  />
                  <button onClick={() => setReveal({ ...reveal, [w.id]: !show })} className="rounded-lg border border-border px-2.5 text-muted-foreground hover:bg-muted" title={show ? "Hide" : "Reveal"}>
                    {show ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                  <button onClick={() => save(w)} disabled={busy === w.id || !changed} className={cn("inline-flex items-center gap-1.5 rounded-lg px-4 py-2 text-sm font-semibold disabled:opacity-50", changed ? "bg-primary text-primary-foreground hover:bg-primary/90" : "border border-border hover:bg-muted")}>
                    {busy === w.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />} Save
                  </button>
                </div>
                {changed && !valid && <p className="mt-1 text-xs text-red-500">Enter a valid EVM address (0x + 40 hex characters).</p>}
              </div>
              {w.key === "buffer" && (() => {
                const current = Number(w.autoRolloverAmount || 0);
                const changed = (Number(rollDraft) || 0) !== current;
                return (
                  <div className="mt-3 rounded-lg border border-accent/30 bg-accent/5 p-3">
                    <div className="flex items-center justify-between">
                      <p className="text-xs font-medium text-muted-foreground">Per-draw auto-rollover into the jackpot</p>
                      <span className="text-[11px] text-muted-foreground">Current: <b className="text-foreground">{fmtUSD(current)}</b></span>
                    </div>
                    <div className="mt-1.5 flex gap-2">
                      <InteractiveInput type="number" min="0" step="0.01" value={rollDraft} onChange={(e) => setRollDraft(e.target.value)} placeholder="Amount (USD) per draw" className="flex-1" />
                      <button onClick={saveRollover} disabled={savingRoll} className={cn("inline-flex items-center gap-1.5 rounded-lg px-4 py-2 text-sm font-semibold disabled:opacity-50", changed ? "bg-gold-gradient text-foreground" : "border border-border bg-background text-muted-foreground")}>
                        {savingRoll ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />} Save
                      </button>
                    </div>
                    <p className="mt-1 text-[11px] text-muted-foreground">This amount auto-rolls from the Buffer wallet into the 5/5 Jackpot every draw until you change it (capped by available buffer).</p>
                  </div>
                );
              })()}
              </div>
              );
              })}
              </div>

              <div className="rounded-2xl border border-border bg-card p-5 shadow-sm">
              <div className="flex items-center gap-2">
              <History className="h-4 w-4 text-accent" />
              <h3 className="text-sm font-bold">Sweep Distribution History</h3>
              </div>
              <p className="mt-1 text-[11px] text-muted-foreground">Permanent record of every completed collector-wallet sweep cycle. Pending allocations reset to $0.00 after each one.</p>
              <div className="mt-3 space-y-2">
              {sweepHistory.length === 0 && <p className="text-sm text-muted-foreground">No sweeps completed yet. Cycles appear here once the collector reaches the threshold.</p>}
              {sweepHistory.map((s) => {
              let transfers = [];
              try { transfers = JSON.parse(s.transfers || "[]"); } catch (_) {}
              return (
              <div key={s.id} className="rounded-xl border border-border p-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[11px] font-bold text-primary">Cycle #{s.cycleNumber}</span>
                  <span className={cn("rounded-full px-2 py-0.5 text-[10px] font-semibold", s.status === "COMPLETED" ? "bg-emerald-100 text-emerald-700" : "bg-amber-100 text-amber-700")}>{s.status}</span>
                </div>
                <p className="text-[11px] text-muted-foreground">{new Date(s.sweptAt).toLocaleString()}</p>
              </div>
              <div className="mt-2 flex flex-wrap gap-4 text-xs">
                <span><b className="text-foreground">{fmtUSD(s.collectorBalance)}</b> <span className="text-muted-foreground">swept</span></span>
                <span><b className="text-foreground">{fmtUSD(s.totalDistributed)}</b> <span className="text-muted-foreground">distributed</span></span>
                <span className="text-muted-foreground">{fmtUSD(s.usdc)} USDC · {fmtUSD(s.usdt)} USDT</span>
                <span className="text-muted-foreground">{transfers.length} transfers</span>
              </div>
              </div>
              );
              })}
              </div>
              </div>
              </div>
              );
              }