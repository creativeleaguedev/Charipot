import React, { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { useWallet } from "@/lib/useWallet";
import { loadConfig, fmtUSD } from "@/lib/configRegistry";
import { useToast } from "@/components/ui/use-toast";
import { friendlyWalletError } from "@/lib/walletErrors";
import { InteractiveInput } from "@/components/ui/interactive-input";
import TicketBuilder from "@/components/TicketBuilder";
import { Image } from "@/components/ui/image";
import {
  Mail, Ticket, CheckCircle2, Wallet, Users,
} from "lucide-react";

const TICKET_LOGO = "https://media.base44.com/images/public/6a9fd1112d3233a0a31bca58/ea7c49493_tickets.jpg";

const isEmail = (s) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s);

// Agent "Sell on Behalf" uses the SAME Play-for-Charity TicketBuilder the
// regular Play page uses — the agent picks numbers exactly like every other
// user, then assigns the whole cart to one recipient (by email) and pays from
// their own crypto wallet. Tickets enter the same active draw and add to its
// jackpot / prize pool just like any other purchase. Run the builder again for
// another recipient.
export default function AgentSellTickets() {
  const { user, wallet, refresh } = useWallet();
  const { toast } = useToast();
  const [builderOpen, setBuilderOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [config, setConfig] = useState(null);
  const [history, setHistory] = useState([]);
  const [result, setResult] = useState(null);
  const [recipient, setRecipient] = useState({ email: "", fullName: "" });

  const price = config?.ticket_price?.value ?? 0.1;
  // Auto: use passes when the agent has any, otherwise fall back to crypto wallet.
  const passBalance = wallet?.passBalance || 0;
  const usePasses = passBalance > 0;

  useEffect(() => { (async () => setConfig(await loadConfig()))(); }, []);

  const loadHistory = async () => {
    if (!user) return;
    try {
      const t = await base44.entities.Ticket.filter({ purchasedByAgentId: user.id }, "-createdAt", 30);
      setHistory(t);
    } catch (_) {}
  };
  useEffect(() => { loadHistory(); }, [user]);

  const canBuild = isEmail(recipient.email.trim());

  // Reuses the Play TicketBuilder's onCheckout contract: (combos, agentCode).
  // We ignore agentCode and route all chosen number-sets to the single recipient.
  const agentCheckout = async (combos) => {
    if (!canBuild) return { error: "Enter a valid recipient email first." };
    setBusy(true);
    try {
      const res = await base44.functions.invoke("agentPurchaseTickets", {
        usePasses,
        items: combos.map((c) => ({
          email: recipient.email.trim().toLowerCase(),
          fullName: recipient.fullName.trim(),
          numbers: c,
        })),
      });
      const d = res.data;
      if (d?.error === "insufficient_gas") {
        return { error: `Insufficient gas fee — deposit a small amount of ${d.native} on ${d.chain}.` };
      } else if (d?.error === "insufficient_passes") {
        return { error: `Not enough passes: need ${d.needed}, you have ${d.balance || 0}.` };
      } else if (d?.error === "insufficient") {
        return { error: `Insufficient balance: need ${fmtUSD(d.needed)}, wallet holds ${fmtUSD(d.balance || 0)}.` };
      } else if (d?.error === "blacklisted") {
        return { error: "Account restricted" };
      } else if (d?.needsWallet) {
        return { error: "Create your crypto wallet first." };
      } else if (d?.error) {
        return { error: d.error };
      }
      toast({ title: "Purchase complete", description: d.paidWith.method === "passes"
        ? `${d.totalTickets} tickets · redeemed ${d.paidWith.passes} passes`
        : `${d.totalTickets} tickets · ${fmtUSD(d.totalAmount)} paid in ${d.paidWith.token} on ${d.paidWith.chain}` });
      setResult(d);
      setRecipient({ email: "", fullName: "" });
      refresh();
      loadHistory();
      return { success: true };
    } catch (e) {
      return { error: String(e?.message || e) };
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-5">
      <div className="rounded-2xl border border-border bg-card p-6 shadow-sm">
        <div className="flex items-center gap-2">
          <Image src={TICKET_LOGO} alt="Ticket" fittingType="fit" className="h-12 w-16 shrink-0 drop-shadow" />
          <div>
            <h2 className="text-lg font-bold">Sell Tickets on Behalf of Users</h2>
            <p className="text-xs text-muted-foreground">Pick numbers with the same Play for Charity builder, assign the cart to a recipient, and pay from your own wallet. Tickets add to the active draw jackpot.</p>
          </div>
        </div>

        <div className="mt-4 grid gap-3 sm:grid-cols-3">
          <div className="rounded-xl bg-muted/50 p-3">
            <p className="text-[10px] uppercase tracking-wide text-muted-foreground">Event</p>
            <p className="text-sm font-semibold">Chari Charity Draw</p>
          </div>
          <div className="rounded-xl bg-muted/50 p-3">
            <p className="text-[10px] uppercase tracking-wide text-muted-foreground">Ticket type</p>
            <p className="text-sm font-semibold">5/39 Standard Entry</p>
          </div>
          <div className="rounded-xl bg-accent/10 p-3">
            <p className="text-[10px] uppercase tracking-wide text-muted-foreground">Price / ticket</p>
            <p className="text-sm font-semibold">{usePasses ? "1 pass" : fmtUSD(price)} · {usePasses ? "redeeming your passes" : "paying from your wallet"}</p>
          </div>
        </div>

        {/* Recipient for this cart */}
        <div className="mt-4 rounded-xl border border-border bg-background p-4">
          <p className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wide text-muted-foreground"><Users className="h-3.5 w-3.5" /> Recipient for this purchase</p>
          <div className="mt-3 grid gap-2 sm:grid-cols-2">
            <div>
              <label className="text-[11px] text-muted-foreground">Recipient email</label>
              <InteractiveInput value={recipient.email} onChange={(e) => setRecipient({ ...recipient, email: e.target.value })}
                placeholder="client@example.com"
                className="mt-1 w-full" />
            </div>
            <div>
              <label className="text-[11px] text-muted-foreground">Recipient name (optional)</label>
              <InteractiveInput value={recipient.fullName} onChange={(e) => setRecipient({ ...recipient, fullName: e.target.value })}
                placeholder="Jane Doe"
                className="mt-1 w-full" />
            </div>
          </div>
          {/* Payment method is automatic: passes when available, else wallet */}
          <div className="mt-4 flex flex-wrap items-center gap-2 rounded-lg bg-muted/40 px-3 py-2 text-xs">
            {usePasses
              ? <><Ticket className="h-3.5 w-3.5 text-emerald-600" /><span className="font-semibold text-emerald-700">Using your passes</span><span className="text-muted-foreground">· {passBalance} pass{passBalance === 1 ? "" : "es"} available (1 pass per ticket)</span></>
              : <><Wallet className="h-3.5 w-3.5 text-primary" /><span className="font-semibold">Paying from your wallet</span><span className="text-muted-foreground">· no passes available</span></>}
          </div>

          <button onClick={() => setBuilderOpen(true)} disabled={!canBuild}
            className="mt-4 inline-flex items-center gap-2 rounded-xl bg-gold-gradient px-6 py-3 text-sm font-bold text-primary-foreground shadow-lg transition-transform hover:scale-[1.01] disabled:cursor-not-allowed disabled:opacity-50">
            <Ticket className="h-4 w-4" /> Build Tickets (Play for Charity)
          </button>
          {!canBuild && <p className="mt-2 text-[11px] text-muted-foreground">Enter a valid recipient email to start building tickets.</p>}
        </div>
      </div>

      {/* Confirmation summary */}
      {result && (
        <div className="rounded-2xl border border-emerald-300/60 bg-emerald-50/60 p-6 shadow-sm neon-green">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="h-5 w-5 text-emerald-600" />
            <h2 className="text-lg font-bold text-emerald-700">Purchase complete</h2>
          </div>
          <p className="mt-1 text-sm text-emerald-700/80">
            {result.paidWith.method === "passes"
              ? <>Redeemed {result.paidWith.passes} pass{result.paidWith.passes === 1 ? "" : "es"} for {result.totalTickets} ticket{result.totalTickets === 1 ? "" : "s"}.</>
              : <>Paid {fmtUSD(result.totalAmount)} for {result.totalTickets} ticket{result.totalTickets === 1 ? "" : "s"} in {result.paidWith.token} on {result.paidWith.chain} (tx {result.paidWith.txHash ? result.paidWith.txHash.slice(0, 10) + "…" : "—"}).</>}
            {result.drawExecuted ? " The draw reached its target and was executed." : ""}
          </p>
          <div className="mt-4 overflow-hidden rounded-xl border border-emerald-200 bg-white">
            <div className="grid grid-cols-[1fr_60px_1fr] gap-2 bg-emerald-50 px-4 py-2 text-[11px] font-semibold uppercase tracking-wide text-emerald-700">
              <span>Recipient</span><span className="text-center">Qty</span><span>Serial numbers</span>
            </div>
            <div className="divide-y divide-emerald-100">
              {result.summary.map((r) => (
                <div key={r.email} className="grid grid-cols-[1fr_60px_1fr] items-start gap-2 px-4 py-2.5 text-sm">
                  <div>
                    <p className="font-semibold">{r.email}</p>
                    <p className="text-[11px] text-muted-foreground">
                      {r.name}{r.pendingRegistration ? " · invited (pending registration)" : ""} ·{" "}
                      <span className={r.emailDelivered ? "text-emerald-600" : "text-amber-600"}>
                        {r.emailDelivered ? "email sent" : "email pending"}
                      </span>
                    </p>
                  </div>
                  <span className="text-center font-bold">{r.quantity}</span>
                  <div className="flex flex-wrap gap-1">
                    {r.serials.map((s) => (
                      <span key={s} className="rounded bg-emerald-100 px-1.5 py-0.5 font-mono text-[10px] text-emerald-700">{s}</span>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
          {!result.allEmailsDelivered && (
            <div className="mt-3 flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-700">
              <Mail className="mt-0.5 h-4 w-4 shrink-0" />
              <span>One or more ticket emails couldn't be delivered to recipients who haven't registered an account yet. The tickets are still saved to their account and will appear under "My Tickets" once they register with that email. To email unregistered recipients, connect a custom domain (charipot.org) in Domains.</span>
            </div>
          )}
          <button onClick={() => setResult(null)} className="mt-4 rounded-lg border border-emerald-300 bg-white px-4 py-2 text-sm font-semibold text-emerald-700 hover:bg-emerald-50">Done</button>
        </div>
      )}

      {/* Transaction history: "Purchased on behalf of [email]" */}
      <div className="rounded-2xl border border-border bg-card p-6 shadow-sm">
        <div className="flex items-center gap-2">
          <Ticket className="h-5 w-5 text-primary" />
          <h2 className="text-lg font-bold">Purchase History</h2>
        </div>
        <p className="mt-1 text-xs text-muted-foreground">Every ticket you have bought on behalf of a client.</p>
        <div className="mt-4 space-y-2">
          {history.length === 0 ? (
            <p className="text-sm text-muted-foreground">No purchases yet. Enter a recipient email and build tickets to sell your first ticket.</p>
          ) : history.map((t) => (
            <div key={t.id} className="flex items-center justify-between rounded-xl border border-border p-3">
              <div className="min-w-0">
                <p className="text-sm font-semibold">Purchased on behalf of {t.recipientEmail || "—"}</p>
                <p className="flex flex-wrap items-center gap-x-2 text-[11px] text-muted-foreground">
                  <span className="font-mono">{t.serialNumber}</span>
                  <span>· Draw #{t.drawNumber}</span>
                  <span>· Numbers {t.numbers}</span>
                </p>
              </div>
              <div className="text-right">
                <p className="text-sm font-bold text-accent">{fmtUSD(t.price)}</p>
                <span className="text-[10px] font-semibold text-emerald-600">Active</span>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Reuses the EXACT same Play for Charity builder the Play page uses. */}
      <TicketBuilder
        open={builderOpen}
        onOpenChange={setBuilderOpen}
        price={price}
        config={config}
        payMethod={{ chain: "bnb", token: "USDC" }}
        setPayMethod={() => {}}
        buying={busy}
        onCheckout={agentCheckout}
        defaultAgentCode=""
        insufficient={false}
        remainingTickets={null}
        passMode={usePasses}
        passBalance={passBalance}
      />
    </div>
  );
}