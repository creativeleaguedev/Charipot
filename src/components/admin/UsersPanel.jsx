import React, { useState, useEffect, useMemo } from "react";
import { base44 } from "@/api/base44Client";
import { fmtUSD, fmtNum, parseOnChainBalances } from "@/lib/configRegistry";
import { cn } from "@/lib/utils";
import {
  Users as UsersIcon, Search, RefreshCw, Wallet as WalletIcon,
  Ticket as TicketIcon, ArrowDownToLine, Trophy, BadgeCheck, ShieldAlert,
} from "lucide-react";
import UserDetailDrawer from "@/components/admin/UserDetailDrawer";
import { InteractiveInput } from "@/components/ui/interactive-input";

const ROLE_LABELS = {
  admin: "Super Admin",
  platform_admin: "Platform Admin",
  participant: "User",
  user: "User",
};

const ROLE_BADGE = {
  admin: "bg-red-100 text-red-700",
  platform_admin: "bg-amber-100 text-amber-700",
  participant: "bg-muted text-muted-foreground",
  user: "bg-muted text-muted-foreground",
};

function initials(u) {
  return (u?.full_name || u?.email || "U").charAt(0).toUpperCase();
}

function StatCard({ icon: Icon, label, value, tone }) {
  return (
    <div className="rounded-2xl border border-border bg-card p-4 shadow-sm">
      <div className="flex items-center gap-2">
        <span className={cn("flex h-8 w-8 items-center justify-center rounded-lg", tone)}>
          <Icon className="h-4 w-4" />
        </span>
        <p className="text-xs text-muted-foreground">{label}</p>
      </div>
      <p className="mt-2 text-xl font-bold">{value}</p>
    </div>
  );
}

export default function UsersPanel({ user: adminUser }) {
  const [loading, setLoading] = useState(true);
  const [users, setUsers] = useState([]);
  const [wallets, setWallets] = useState([]);
  const [tickets, setTickets] = useState([]);
  const [txns, setTxns] = useState([]);
  const [govTxns, setGovTxns] = useState([]);
  const [query, setQuery] = useState("");
  const [roleFilter, setRoleFilter] = useState("all");
  const [selectedId, setSelectedId] = useState(null);
  const [refreshing, setRefreshing] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      // Users + wallets come from a privileged backend function so both the
      // "admin" and "platform_admin" roles see every record (the built-in User
      // entity can only be listed by "admin" directly).
      const res = await base44.functions.invoke("getAdminUsers", {});
      const u = res?.data?.users || [];
      const w = res?.data?.wallets || [];
      const [t, tx, g] = await Promise.all([
        base44.entities.Ticket.list("-createdAt", 2000),
        base44.entities.CryptoTransaction.list("-createdAt", 2000),
        base44.entities.GovTransaction.list("-createdAt", 1000),
      ]);
      setUsers(u);
      setWallets(w);
      setTickets(t || []);
      setTxns(tx || []);
      setGovTxns(g || []);
    } catch (_) {
      /* ignore */
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const refresh = async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  };

  const walletByUserId = useMemo(() => {
    const m = {};
    (wallets || []).forEach((w) => { if (w.userId) m[w.userId] = w; });
    return m;
  }, [wallets]);

  const rows = useMemo(() => {
    return (users || []).map((u) => {
      const w = walletByUserId[u.id];
      const uTickets = tickets.filter((t) => t.userId === u.id);
      const uTxns = txns.filter((t) => t.userId === u.id);
      const deposits = uTxns.filter((t) => t.type === "DEPOSIT" && t.status === "CONFIRMED");
      const withdrawals = uTxns.filter((t) => t.type === "WITHDRAW" && t.status === "CONFIRMED");
      const passBuys = uTxns.filter((t) => t.type === "PASS_PURCHASE" && t.status === "CONFIRMED");
      const wins = uTickets.filter((t) => t.status === "WINNING");
      return {
        user: u,
        wallet: w,
        uTickets,
        uTxns,
        ticketCount: uTickets.length,
        totalSpent: uTickets.reduce((s, t) => s + (t.price || 0), 0),
        depositTotal: deposits.reduce((s, t) => s + (t.amount || 0), 0),
        depositCount: deposits.length,
        withdrawTotal: withdrawals.reduce((s, t) => s + (t.amount || 0), 0),
        withdrawCount: withdrawals.length,
        passSpend: passBuys.reduce((s, t) => s + (t.amount || 0), 0),
        passBuyCount: passBuys.length,
        winsCount: wins.length,
        prizesWon: wins.reduce((s, t) => s + (t.prizeAmount || 0), 0),
        govCount: govTxns.filter((g) => g.fromUserId === u.id || g.toUserId === u.id).length,
      };
    });
  }, [users, walletByUserId, tickets, txns, govTxns]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return rows.filter((r) => {
      const role = r.user.role || "participant";
      if (roleFilter !== "all" && role !== roleFilter) return false;
      if (!q) return true;
      return (
        (r.user.full_name || "").toLowerCase().includes(q) ||
        (r.user.email || "").toLowerCase().includes(q) ||
        (r.wallet?.agentCode || "").toLowerCase().includes(q) ||
        (r.wallet?.walletAddress || "").toLowerCase().includes(q)
      );
    });
  }, [rows, query, roleFilter]);

  const totals = useMemo(() => ({
    users: rows.length,
    agents: rows.filter((r) => r.wallet?.isAgent).length,
    wallets: rows.filter((r) => !!r.wallet).length,
    blacklisted: rows.filter((r) => r.wallet?.isBlacklisted).length,
    onchain: rows.reduce((s, r) => s + parseOnChainBalances(r.wallet?.cryptoBalances).total, 0),
    tickets: rows.reduce((s, r) => s + r.ticketCount, 0),
    spent: rows.reduce((s, r) => s + r.totalSpent, 0),
    prizes: rows.reduce((s, r) => s + r.prizesWon, 0),
  }), [rows]);

  const selectedRow = rows.find((r) => r.user.id === selectedId) || null;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-muted-foreground">
          Every registered user — profile, role, platform wallet, ticket purchases, on-chain balance, passes, GOV and prize activity. Click a row for the full record.
        </p>
        <button
          onClick={refresh}
          disabled={refreshing || loading}
          className="inline-flex items-center gap-2 rounded-lg border border-border bg-card px-3 py-2 text-sm font-semibold hover:bg-muted disabled:opacity-50"
        >
          <RefreshCw className={cn("h-4 w-4", (refreshing || loading) && "animate-spin")} /> Refresh
        </button>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard icon={UsersIcon} label="Registered users" value={fmtNum(totals.users)} tone="bg-primary/10 text-primary" />
        <StatCard icon={BadgeCheck} label="Agents" value={fmtNum(totals.agents)} tone="bg-emerald-100 text-emerald-700" />
        <StatCard icon={WalletIcon} label="Wallets created" value={fmtNum(totals.wallets)} tone="bg-sky-100 text-sky-700" />
        <StatCard icon={ShieldAlert} label="Blacklisted" value={fmtNum(totals.blacklisted)} tone="bg-red-100 text-red-700" />
        <StatCard icon={WalletIcon} label="On-chain balance" value={fmtUSD(totals.onchain)} tone="bg-sky-100 text-sky-700" />
        <StatCard icon={TicketIcon} label="Tickets bought" value={fmtNum(totals.tickets)} tone="bg-accent/15 text-accent" />
        <StatCard icon={TicketIcon} label="Ticket spend" value={fmtUSD(totals.spent)} tone="bg-primary/10 text-primary" />
        <StatCard icon={Trophy} label="Prizes won" value={fmtUSD(totals.prizes)} tone="bg-amber-100 text-amber-700" />
      </div>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <InteractiveInput
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search by name, email, agent code or wallet address…"
            className="w-full pl-9 pr-3"
          />
        </div>
        <div className="flex flex-wrap gap-2">
          {["all", "admin", "platform_admin", "participant"].map((r) => (
            <button
              key={r}
              onClick={() => setRoleFilter(r)}
              className={cn(
                "rounded-full px-3 py-1.5 text-xs font-semibold transition-colors",
                roleFilter === r ? "bg-primary text-primary-foreground" : "border border-border bg-card text-muted-foreground hover:bg-muted"
              )}
            >
              {r === "all" ? "All roles" : ROLE_LABELS[r] || r}
            </button>
          ))}
        </div>
      </div>

      <div className="overflow-hidden rounded-2xl border border-border bg-card shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[860px] text-sm">
            <thead>
              <tr className="border-b border-border bg-muted/40 text-left text-[11px] uppercase tracking-wide text-muted-foreground">
                <th className="px-4 py-3 font-semibold">User</th>
                <th className="px-4 py-3 font-semibold">Role</th>
                <th className="px-4 py-3 font-semibold">Wallet</th>
                <th className="px-4 py-3 text-right font-semibold">Tickets</th>
                <th className="px-4 py-3 text-right font-semibold">On-chain</th>
                <th className="px-4 py-3 text-right font-semibold">Passes</th>
                <th className="px-4 py-3 text-right font-semibold">GOV</th>
                <th className="px-4 py-3 text-right font-semibold">Prizes</th>
                <th className="px-4 py-3 font-semibold">Status</th>
              </tr>
            </thead>
            <tbody>
              {loading && (
                <tr>
                  <td colSpan={9} className="px-4 py-16 text-center text-muted-foreground">
                    <div className="mx-auto h-6 w-6 animate-spin rounded-full border-4 border-muted border-t-primary" />
                    <p className="mt-2 text-xs">Loading every user record…</p>
                  </td>
                </tr>
              )}
              {!loading && filtered.length === 0 && (
                <tr>
                  <td colSpan={9} className="px-4 py-12 text-center text-sm text-muted-foreground">No users match your search.</td>
                </tr>
              )}
              {!loading && filtered.map((r) => {
                const role = r.user.role || "participant";
                const w = r.wallet;
                return (
                  <tr
                    key={r.user.id}
                    onClick={() => setSelectedId(r.user.id)}
                    className="cursor-pointer border-b border-border/60 transition-colors hover:bg-muted/40"
                  >
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-3">
                        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-navy-gradient text-xs font-bold text-white">
                          {initials(r.user)}
                        </span>
                        <div className="min-w-0">
                          <p className="truncate font-semibold">{r.user.full_name || "—"}</p>
                          <p className="truncate text-xs text-muted-foreground">{r.user.email || "—"}</p>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <span className={cn("rounded-full px-2.5 py-0.5 text-[11px] font-semibold", ROLE_BADGE[role] || ROLE_BADGE.user)}>
                        {ROLE_LABELS[role] || role}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      {w ? (
                        <div className="min-w-0">
                          <p className="truncate font-mono text-xs" title={w.walletAddress}>
                            {w.walletAddress ? `${w.walletAddress.slice(0, 6)}…${w.walletAddress.slice(-4)}` : "—"}
                          </p>
                          {w.isAgent && <p className="text-[10px] text-emerald-600">{w.agentTier || "agent"} · {w.agentCode}</p>}
                        </div>
                      ) : (
                        <span className="text-xs text-muted-foreground">No wallet</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <p className="font-semibold">{fmtNum(r.ticketCount)}</p>
                      <p className="text-[11px] text-muted-foreground">{fmtUSD(r.totalSpent)}</p>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <p className="font-semibold">{fmtUSD(parseOnChainBalances(w?.cryptoBalances).total)}</p>
                      <p className="text-[11px] text-muted-foreground">{w?.lastSyncAt ? new Date(w.lastSyncAt).toLocaleDateString() : "not synced"}</p>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <p className="font-semibold">{fmtNum(w?.passBalance || 0)}</p>
                      <p className="text-[11px] text-muted-foreground">{fmtNum(w?.passPurchased || 0)} bought</p>
                    </td>
                    <td className="px-4 py-3 text-right font-semibold text-accent">{fmtNum(w?.govBalance || 0)}</td>
                    <td className="px-4 py-3 text-right">
                      <p className="font-semibold">{fmtUSD(r.prizesWon)}</p>
                      <p className="text-[11px] text-muted-foreground">{r.winsCount} win{r.winsCount === 1 ? "" : "s"}</p>
                    </td>
                    <td className="px-4 py-3">
                      {w?.isBlacklisted ? (
                        <span className="inline-flex items-center gap-1 rounded-full bg-red-100 px-2 py-0.5 text-[10px] font-semibold text-red-700"><ShieldAlert className="h-3 w-3" /> Blacklisted</span>
                      ) : w?.isAgent ? (
                        <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-semibold text-emerald-700"><BadgeCheck className="h-3 w-3" /> Agent</span>
                      ) : (
                        <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] font-medium text-muted-foreground">Active</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {selectedRow && (
        <UserDetailDrawer
          row={selectedRow}
          govTxns={(govTxns || []).filter((g) => g.fromUserId === selectedRow.user.id || g.toUserId === selectedRow.user.id)}
          onClose={() => setSelectedId(null)}
          onChanged={load}
        />
      )}
    </div>
  );
}