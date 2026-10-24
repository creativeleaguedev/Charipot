import React, { useState } from "react";
import { fmtUSD, fmtNum, parseNumbers, parseOnChainBalances } from "@/lib/configRegistry";
import { base44 } from "@/api/base44Client";
import { useToast } from "@/components/ui/use-toast";
import { cn } from "@/lib/utils";
import NumberBall from "@/components/ui/NumberBall";
import {
  X, Copy, Check, Wallet as WalletIcon, Ticket as TicketIcon,
  ArrowDownToLine, ArrowUpFromLine, Tag, Coins, Trophy, ShieldAlert, BadgeCheck, UserCircle, RefreshCw, ShieldCheck, ShieldOff,
} from "lucide-react";

const ROLE_LABELS = {
  admin: "Super Admin",
  platform_admin: "Platform Admin",
  participant: "User",
  user: "User",
};

const TX_LABELS = {
  DEPOSIT: "Deposit",
  WITHDRAW: "Withdrawal",
  LOTTERY_BUY: "Ticket purchase",
  PASS_PURCHASE: "Pass purchase",
  DONATION: "Donation",
  PRIZE_PAYOUT: "Prize payout",
  GOV_MINT: "GOV mint",
  FEE: "Fee",
  GAS: "Gas",
};

function Chip({ label, value, tone }) {
  return (
    <div className="rounded-xl border border-border bg-muted/30 p-3">
      <p className="text-[11px] uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className={cn("mt-0.5 text-lg font-bold", tone)}>{value}</p>
    </div>
  );
}

export default function UserDetailDrawer({ row, govTxns, onClose, onChanged }) {
  const { user: u, wallet: w, uTickets, uTxns } = row;
  const [copied, setCopied] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [live, setLive] = useState(() => parseOnChainBalances(w?.cryptoBalances));
  const [savingRole, setSavingRole] = useState(false);
  const [currentRole, setCurrentRole] = useState(u.role || "user");
  const [confirmRole, setConfirmRole] = useState(null);
  const { toast } = useToast();
  const role = currentRole || "user";

  const applyRoleChange = async (nextRole) => {
    setSavingRole(true);
    try {
      const res = await base44.functions.invoke("adminSetUserRole", { userId: u.id, role: nextRole });
      if (res?.data?.user) setCurrentRole(res.data.user.role);
      setConfirmRole(null);
      toast({ title: "Role updated", description: `${u.full_name || u.email} is now ${nextRole === "admin" ? "an Admin" : "a User"}` });
      if (onChanged) onChanged();
    } catch (e) {
      toast({ title: "Failed to update role", description: e.message, variant: "destructive" });
    } finally {
      setSavingRole(false);
    }
  };

  const syncOnChain = async () => {
    if (!w?.id) return;
    setSyncing(true);
    try {
      const res = await base44.functions.invoke("getAdminOnChainBalances", { walletId: w.id });
      const data = res?.data;
      if (data?.chains) {
        const total = data.chains.reduce((s, c) => s + Number(c.balances?.USDC || 0) + Number(c.balances?.USDT || 0), 0);
        setLive({ total, chains: data.chains });
        toast({ title: "On-chain balance synced" });
      } else if (data?.error) {
        toast({ title: "Sync failed", description: data.error, variant: "destructive" });
      }
    } catch (e) {
      toast({ title: "Sync failed", description: e.message, variant: "destructive" });
    } finally {
      setSyncing(false);
    }
  };

  const copy = (text) => {
    if (!text) return;
    try {
      navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch (_) { /* ignore */ }
  };

  const sortedTickets = [...uTickets].sort((a, b) => (b.createdAt || "").localeCompare(a.createdAt || ""));
  const sortedTxns = [...uTxns].sort((a, b) => (b.createdAt || "").localeCompare(a.createdAt || ""));
  const sortedGov = [...(govTxns || [])].sort((a, b) => (b.createdAt || "").localeCompare(a.createdAt || ""));

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="relative flex h-full w-full max-w-xl flex-col bg-card shadow-2xl">
        {/* Header */}
        <div className="flex items-start justify-between gap-3 border-b border-border bg-navy-gradient p-5 text-white">
          <div className="flex items-center gap-3">
            <span className="flex h-12 w-12 items-center justify-center rounded-full bg-white/15 text-lg font-bold">
              {(u.full_name || u.email || "U").charAt(0).toUpperCase()}
            </span>
            <div>
              <h2 className="text-lg font-bold">{u.full_name || "Unnamed user"}</h2>
              <p className="text-sm text-white/80">{u.email || "—"}</p>
              <p className="mt-0.5 text-[11px] text-white/60">
                {ROLE_LABELS[role] || role} · Joined {u.created_date ? new Date(u.created_date).toLocaleDateString() : "—"}
              </p>
            </div>
          </div>
          <button onClick={onClose} className="rounded-full p-1.5 text-white/80 hover:bg-white/15 hover:text-white">
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Role control */}
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border bg-muted/30 px-5 py-3">
          <div className="flex items-center gap-2 text-sm">
            <ShieldCheck className="h-4 w-4 text-primary" />
            <span className="font-semibold">Access role</span>
            <span className={cn("rounded-full px-2.5 py-0.5 text-[11px] font-semibold", role === "admin" ? "bg-red-100 text-red-700" : "bg-muted text-muted-foreground")}>
              {ROLE_LABELS[role] || role}
            </span>
          </div>
          {confirmRole ? (
            <div className="flex items-center gap-2">
              <span className="text-xs text-muted-foreground">Make {confirmRole === "admin" ? "an Admin" : "a User"}?</span>
              <button
                onClick={() => applyRoleChange(confirmRole)}
                disabled={savingRole}
                className={cn("inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-50", confirmRole === "admin" ? "bg-red-600 hover:bg-red-600/90" : "bg-primary hover:bg-primary/90")}
              >
                {savingRole ? "Saving…" : <>Confirm</>}
              </button>
              <button onClick={() => setConfirmRole(null)} disabled={savingRole} className="rounded-lg border border-border bg-card px-3 py-1.5 text-xs font-semibold hover:bg-muted">
                Cancel
              </button>
            </div>
          ) : (
            <button
              onClick={() => setConfirmRole(role === "admin" ? "user" : "admin")}
              disabled={savingRole}
              className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-card px-3 py-1.5 text-xs font-semibold hover:bg-muted disabled:opacity-50"
            >
              {role === "admin" ? <><ShieldOff className="h-3.5 w-3.5" /> Demote to User</> : <><ShieldCheck className="h-3.5 w-3.5" /> Promote to Admin</>}
            </button>
          )}
        </div>

        <div className="flex-1 space-y-5 overflow-y-auto p-5">
          {/* Wallet block */}
          <section>
            <h3 className="flex items-center gap-2 text-sm font-bold uppercase tracking-wide text-muted-foreground">
              <WalletIcon className="h-4 w-4" /> Platform Wallet
            </h3>
            {w ? (
              <div className="mt-3 space-y-3">
                <button
                  onClick={() => copy(w.walletAddress)}
                  className="flex w-full items-center justify-between gap-2 rounded-xl border border-border bg-muted/30 px-3 py-2.5 text-left hover:bg-muted"
                >
                  <span className="min-w-0">
                    <span className="block text-[11px] text-muted-foreground">Wallet address (click to copy)</span>
                    <span className="block truncate font-mono text-xs">{w.walletAddress || "—"}</span>
                  </span>
                  {copied ? <Check className="h-4 w-4 shrink-0 text-emerald-600" /> : <Copy className="h-4 w-4 shrink-0 text-muted-foreground" />}
                </button>
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                  <Chip label="GOV balance" value={fmtNum(w.govBalance || 0)} tone="text-accent" />
                  <Chip label="GOV burned" value={fmtNum(w.govBurned || 0)} tone="text-foreground" />
                  <Chip label="Prize bal." value={fmtUSD(w.prizeBalance || 0)} tone="text-emerald-700" />
                  <Chip label="Passes" value={fmtNum(w.passBalance || 0)} tone="text-primary" />
                  <Chip label="Passes bought" value={fmtNum(w.passPurchased || 0)} tone="text-foreground" />
                  <Chip label="Passes spent" value={fmtNum(w.passSpent || 0)} tone="text-foreground" />
                  <Chip label="Referral earn." value={fmtUSD(w.totalReferralEarnings || 0)} tone="text-foreground" />
                  <Chip label="Bonus earn." value={fmtUSD(w.totalBonusEarnings || 0)} tone="text-foreground" />
                </div>
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                  <Chip label="Tickets sold" value={fmtNum(w.ticketsSold || 0)} tone="text-foreground" />
                  <Chip label="Agent tier" value={w.isAgent ? (w.agentTier || "agent") : "—"} tone={w.isAgent ? "text-emerald-700" : "text-muted-foreground"} />
                  <Chip label="Club" value={w.clubName || "—"} tone="text-foreground" />
                </div>
                {(w.agentCode || w.referrerCode) && (
                  <div className="flex flex-wrap gap-2 text-xs">
                    {w.agentCode && <span className="rounded-lg bg-emerald-50 px-2 py-1 font-mono text-emerald-700">Agent code: {w.agentCode}</span>}
                    {w.referrerCode && <span className="rounded-lg bg-sky-50 px-2 py-1 font-mono text-sky-700">Referrer: {w.referrerCode}</span>}
                  </div>
                )}
                {w.isBlacklisted && (
                  <div className="flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">
                    <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0" />
                    <div>
                      <p className="font-semibold">Wallet blacklisted</p>
                      {w.blacklistReason && <p className="text-xs">{w.blacklistReason}</p>}
                      {w.blacklistedAt && <p className="text-[11px] text-red-600">{new Date(w.blacklistedAt).toLocaleString()}</p>}
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <p className="mt-3 rounded-xl bg-muted/40 p-4 text-sm text-muted-foreground">No platform wallet created yet.</p>
            )}
          </section>

          {/* On-chain live balance */}
          {w?.walletAddress && (
            <section>
              <div className="flex items-center justify-between">
                <h3 className="flex items-center gap-2 text-sm font-bold uppercase tracking-wide text-muted-foreground">
                  <WalletIcon className="h-4 w-4" /> On-chain Balance (live)
                </h3>
                <button onClick={syncOnChain} disabled={syncing} className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-background px-2.5 py-1.5 text-xs font-semibold hover:bg-muted disabled:opacity-50">
                  <RefreshCw className={cn("h-3.5 w-3.5", syncing && "animate-spin")} /> {syncing ? "Syncing…" : "Sync now"}
                </button>
              </div>
              <div className="mt-3 space-y-2">
                {(live.chains || []).length === 0 && (
                  <p className="rounded-xl bg-muted/40 p-4 text-sm text-muted-foreground">No on-chain balance synced yet. Click "Sync now" to read live balances from the chain.</p>
                )}
                {(live.chains || []).map((c) => {
                  const usdc = Number(c.balances?.USDC || 0);
                  const usdt = Number(c.balances?.USDT || 0);
                  const native = Number(c.balances?.native || 0);
                  const hasAny = usdc > 0 || usdt > 0 || native > 0;
                  return (
                    <div key={c.chain} className={cn("rounded-xl border p-3", hasAny ? "border-border" : "border-border bg-muted/30")}>
                      <p className="text-xs font-semibold">{c.name || c.chain}</p>
                      <div className="mt-1 flex flex-wrap gap-3 text-xs">
                        <span className={usdc > 0 ? "text-emerald-700" : "text-muted-foreground"}>USDC {fmtUSD(usdc)}</span>
                        <span className={usdt > 0 ? "text-emerald-700" : "text-muted-foreground"}>USDT {fmtUSD(usdt)}</span>
                        <span className="text-muted-foreground">{c.native} {Number(native).toFixed(4)}</span>
                      </div>
                    </div>
                  );
                })}
                {w?.lastSyncAt && <p className="text-[11px] text-muted-foreground">Last synced {new Date(w.lastSyncAt).toLocaleString()}</p>}
              </div>
            </section>
          )}

          {/* Activity summary */}
          <section>
            <h3 className="flex items-center gap-2 text-sm font-bold uppercase tracking-wide text-muted-foreground">
              <UserCircle className="h-4 w-4" /> Activity Summary
            </h3>
            <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3">
              <Chip label="Tickets bought" value={fmtNum(row.ticketCount)} tone="text-foreground" />
              <Chip label="Ticket spend" value={fmtUSD(row.totalSpent)} tone="text-foreground" />
              <Chip label="Wins" value={fmtNum(row.winsCount)} tone="text-amber-700" />
              <Chip label="Prizes won" value={fmtUSD(row.prizesWon)} tone="text-emerald-700" />
              <Chip label="On-chain" value={fmtUSD(live.total)} tone="text-sky-700" />
              <Chip label="Withdrawals" value={`${fmtNum(row.withdrawCount)} · ${fmtUSD(row.withdrawTotal)}`} tone="text-foreground" />
              <Chip label="Pass purchases" value={`${fmtNum(row.passBuyCount)} · ${fmtUSD(row.passSpend)}`} tone="text-foreground" />
              <Chip label="GOV transfers" value={fmtNum(row.govCount)} tone="text-foreground" />
              <Chip label="Last sync" value={w?.lastSyncAt ? new Date(w.lastSyncAt).toLocaleDateString() : "—"} tone="text-foreground" />
            </div>
          </section>

          {/* Recent tickets */}
          <section>
            <h3 className="flex items-center gap-2 text-sm font-bold uppercase tracking-wide text-muted-foreground">
              <TicketIcon className="h-4 w-4" /> Tickets ({fmtNum(uTickets.length)})
            </h3>
            <div className="mt-3 max-h-72 space-y-2 overflow-y-auto pr-1">
              {sortedTickets.length === 0 && <p className="rounded-xl bg-muted/40 p-4 text-sm text-muted-foreground">No tickets purchased.</p>}
              {sortedTickets.slice(0, 50).map((t) => (
                <div key={t.id} className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-border p-3">
                  <div className="flex items-center gap-1.5">
                    {parseNumbers(t.numbers).map((n, i) => (
                      <NumberBall key={i} n={n} size="sm" variant={t.status === "WINNING" ? "gold" : "navy"} />
                    ))}
                  </div>
                  <div className="text-right text-xs">
                    <p className="text-muted-foreground">Draw #{t.drawNumber} · #{t.ticketNumber}</p>
                    <p className="font-semibold">{fmtUSD(t.price)} · <span className={cn(t.status === "WINNING" ? "text-amber-600" : t.status === "EXPIRED" ? "text-muted-foreground" : "text-emerald-600")}>{t.status}</span></p>
                    {t.prizeAmount > 0 && <p className="text-[11px] text-emerald-700">Won {fmtUSD(t.prizeAmount)} ({t.prizeTier})</p>}
                  </div>
                </div>
              ))}
              {sortedTickets.length > 50 && <p className="text-center text-[11px] text-muted-foreground">Showing 50 most recent of {sortedTickets.length}.</p>}
            </div>
          </section>

          {/* Crypto transactions */}
          <section>
            <h3 className="flex items-center gap-2 text-sm font-bold uppercase tracking-wide text-muted-foreground">
              <ArrowDownToLine className="h-4 w-4" /> Crypto Transactions ({fmtNum(uTxns.length)})
            </h3>
            <div className="mt-3 max-h-80 space-y-2 overflow-y-auto pr-1">
              {sortedTxns.length === 0 && <p className="rounded-xl bg-muted/40 p-4 text-sm text-muted-foreground">No crypto transactions.</p>}
              {sortedTxns.slice(0, 60).map((t) => (
                <div key={t.id} className="flex items-center justify-between gap-2 rounded-xl border border-border p-3 text-sm">
                  <div className="flex items-center gap-2">
                    {t.type === "DEPOSIT" ? <ArrowDownToLine className="h-4 w-4 text-emerald-600" /> :
                     t.type === "WITHDRAW" ? <ArrowUpFromLine className="h-4 w-4 text-amber-600" /> :
                     t.type === "PASS_PURCHASE" ? <Tag className="h-4 w-4 text-sky-600" /> :
                     t.type === "PRIZE_PAYOUT" ? <Trophy className="h-4 w-4 text-amber-600" /> :
                     t.type === "GOV_MINT" ? <Coins className="h-4 w-4 text-accent" /> :
                     <TicketIcon className="h-4 w-4 text-primary" />}
                    <div>
                      <p className="font-medium">{TX_LABELS[t.type] || t.type}</p>
                      <p className="text-[11px] text-muted-foreground">{t.chain} · {t.token} · {t.createdAt ? new Date(t.createdAt).toLocaleString() : "—"}</p>
                    </div>
                  </div>
                  <div className="text-right">
                    <p className="font-semibold">{fmtUSD(t.amount)}</p>
                    <p className={cn("text-[11px] font-medium", t.status === "CONFIRMED" ? "text-emerald-600" : t.status === "FAILED" ? "text-red-600" : "text-amber-600")}>{t.status}</p>
                  </div>
                </div>
              ))}
              {sortedTxns.length > 60 && <p className="text-center text-[11px] text-muted-foreground">Showing 60 most recent of {sortedTxns.length}.</p>}
            </div>
          </section>

          {/* GOV transactions */}
          <section>
            <h3 className="flex items-center gap-2 text-sm font-bold uppercase tracking-wide text-muted-foreground">
              <Coins className="h-4 w-4" /> GOV Activity ({fmtNum(sortedGov.length)})
            </h3>
            <div className="mt-3 max-h-64 space-y-2 overflow-y-auto pr-1">
              {sortedGov.length === 0 && <p className="rounded-xl bg-muted/40 p-4 text-sm text-muted-foreground">No GOV activity.</p>}
              {sortedGov.slice(0, 40).map((g) => {
                const outgoing = g.fromUserId === u.id;
                return (
                  <div key={g.id} className="flex items-center justify-between gap-2 rounded-xl border border-border p-3 text-sm">
                    <div>
                      <p className="font-medium">{g.type} {outgoing ? "→ " : "← "}{outgoing ? (g.toName || "—") : (g.fromName || "—")}</p>
                      <p className="text-[11px] text-muted-foreground">{g.projectName ? `Project: ${g.projectName}` : "—"} · {g.createdAt ? new Date(g.createdAt).toLocaleString() : "—"}</p>
                    </div>
                    <p className={cn("font-semibold", outgoing ? "text-red-600" : "text-emerald-600")}>{outgoing ? "-" : "+"}{fmtNum(g.amount)} GOV</p>
                  </div>
                );
              })}
            </div>
          </section>
        </div>

        <div className="border-t border-border p-4">
          <button onClick={onClose} className="w-full rounded-lg bg-primary py-2.5 text-sm font-semibold text-primary-foreground hover:bg-primary/90">Close</button>
        </div>
      </div>
    </div>
  );
}