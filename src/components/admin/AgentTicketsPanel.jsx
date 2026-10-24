import React, { useState, useEffect, useMemo } from "react";
import { base44 } from "@/api/base44Client";
import { fmtUSD, fmtNum, parseNumbers } from "@/lib/configRegistry";
import { cn } from "@/lib/utils";
import { Search, RefreshCw, UserCog, Ticket as TicketIcon, Mail, Coins } from "lucide-react";
import NumberBall from "@/components/ui/NumberBall";
import { InteractiveInput } from "@/components/ui/interactive-input";

// Recipient display name: use the name the agent typed in at purchase; if none
// was provided (the stored fullName falls back to the email), derive a friendly
// name from the first part of the recipient's email.
function displayName(fullName, email) {
  const name = (fullName || "").trim();
  if (name && !name.includes("@")) return name;
  const local = (email || "").split("@")[0];
  if (!local) return email || "—";
  return local.charAt(0).toUpperCase() + local.slice(1);
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

// Admin oversight of every ticket an agent purchased on a user's behalf:
// recipient email + name, ticket count, serial numbers, the agent who paid,
// and each ticket's value (the configured ticket price captured at purchase).
export default function AgentTicketsPanel() {
  const [loading, setLoading] = useState(true);
  const [tickets, setTickets] = useState([]);
  const [query, setQuery] = useState("");
  const [refreshing, setRefreshing] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const list = await base44.entities.Ticket.filter({ agentPurchase: true });
      (list || []).sort((a, b) =>
        (b.purchasedAt || b.createdAt || "").localeCompare(a.purchasedAt || a.createdAt || "")
      );
      setTickets(list || []);
    } catch (_) {
      setTickets([]);
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

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return tickets;
    return tickets.filter((t) =>
      (t.recipientEmail || "").toLowerCase().includes(q) ||
      (t.fullName || "").toLowerCase().includes(q) ||
      (t.purchasedByAgentEmail || "").toLowerCase().includes(q) ||
      (t.serialNumber || "").toLowerCase().includes(q) ||
      String(t.ticketNumber || "").includes(q) ||
      String(t.drawNumber || "").includes(q)
    );
  }, [tickets, query]);

  const totals = useMemo(() => ({
    tickets: tickets.length,
    value: tickets.reduce((s, t) => s + (t.price || 0), 0),
    recipients: new Set(tickets.map((t) => t.recipientEmail).filter(Boolean)).size,
    agents: new Set(tickets.map((t) => t.purchasedByAgentEmail).filter(Boolean)).size,
  }), [tickets]);

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-muted-foreground">
          Every ticket an agent purchased on a user's behalf — recipient, serial number, the agent who paid, and the ticket value.
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
        <StatCard icon={TicketIcon} label="Agent-purchased tickets" value={fmtNum(totals.tickets)} tone="bg-primary/10 text-primary" />
        <StatCard icon={Coins} label="Total ticket value" value={fmtUSD(totals.value)} tone="bg-accent/15 text-accent" />
        <StatCard icon={Mail} label="Recipients" value={fmtNum(totals.recipients)} tone="bg-sky-100 text-sky-700" />
        <StatCard icon={UserCog} label="Agents" value={fmtNum(totals.agents)} tone="bg-emerald-100 text-emerald-700" />
      </div>

      <div className="relative">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <InteractiveInput
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search by recipient, agent, serial or draw…"
          className="w-full pl-9 pr-3"
        />
      </div>

      <div className="overflow-hidden rounded-2xl border border-border bg-card shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[980px] text-sm">
            <thead>
              <tr className="border-b border-border bg-muted/40 text-left text-[11px] uppercase tracking-wide text-muted-foreground">
                <th className="px-4 py-3 font-semibold">Recipient</th>
                <th className="px-4 py-3 font-semibold">Serial number</th>
                <th className="px-4 py-3 font-semibold">Numbers</th>
                <th className="px-4 py-3 text-right font-semibold">Draw / Ticket</th>
                <th className="px-4 py-3 font-semibold">Agent who bought</th>
                <th className="px-4 py-3 text-right font-semibold">Value</th>
                <th className="px-4 py-3 font-semibold">Date</th>
              </tr>
            </thead>
            <tbody>
              {loading && (
                <tr>
                  <td colSpan={7} className="px-4 py-16 text-center text-muted-foreground">
                    <div className="mx-auto h-6 w-6 animate-spin rounded-full border-4 border-muted border-t-primary" />
                    <p className="mt-2 text-xs">Loading agent tickets…</p>
                  </td>
                </tr>
              )}
              {!loading && filtered.length === 0 && (
                <tr>
                  <td colSpan={7} className="px-4 py-12 text-center text-sm text-muted-foreground">
                    No agent-purchased tickets found.
                  </td>
                </tr>
              )}
              {!loading && filtered.map((t) => (
                <tr key={t.id} className="border-b border-border/60 transition-colors hover:bg-muted/40">
                  <td className="px-4 py-3">
                    <p className="font-semibold">{displayName(t.fullName, t.recipientEmail)}</p>
                    <p className="truncate text-xs text-muted-foreground">{t.recipientEmail || "—"}</p>
                  </td>
                  <td className="px-4 py-3">
                    <span className="font-mono text-xs">{t.serialNumber || "—"}</span>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex gap-0.5">
                      {parseNumbers(t.numbers).map((n, i) => (
                        <NumberBall key={i} n={n} size="sm" variant={t.status === "WINNING" ? "gold" : "navy"} />
                      ))}
                    </div>
                  </td>
                  <td className="px-4 py-3 text-right">
                    <p className="font-semibold">#{t.drawNumber || "—"}</p>
                    <p className="text-[11px] text-muted-foreground">Ticket #{t.ticketNumber || "—"}</p>
                  </td>
                  <td className="px-4 py-3">
                    <p className="truncate text-xs">{t.purchasedByAgentEmail || "—"}</p>
                    {t.agentCode && <p className="text-[10px] text-muted-foreground">{t.agentCode}</p>}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <p className="font-semibold">{fmtUSD(t.price || 0)}</p>
                    <p className="text-[11px] text-muted-foreground">{t.status}</p>
                  </td>
                  <td className="px-4 py-3 text-xs text-muted-foreground">
                    {t.purchasedAt
                      ? new Date(t.purchasedAt).toLocaleDateString()
                      : t.createdAt
                      ? new Date(t.createdAt).toLocaleDateString()
                      : "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}