import React, { useState } from "react";
import { base44 } from "@/api/base44Client";
import { fmtUSD } from "@/lib/configRegistry";
import { useToast } from "@/components/ui/use-toast";
import { CHAINS } from "@/lib/chains";
import { Heart, BadgeCheck } from "lucide-react";
import { InteractiveInput } from "@/components/ui/interactive-input";

export default function DonateCard({ draw, onDonated }) {
  const [amount, setAmount] = useState("");
  const [chain, setChain] = useState("bnb");
  const [token, setToken] = useState("USDC");
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(null);
  const { toast } = useToast();

  const donate = async () => {
    const amt = Number(amount);
    if (!draw || !Number.isFinite(amt) || amt <= 0) return;
    setBusy(true);
    try {
      const payRes = await base44.functions.invoke("payToTreasury", {
        amount: amt,
        chain,
        token,
        purpose: "DONATION",
        reference: "donation_draw_" + draw.drawNumber,
      });
      const pd = payRes.data;
      if (pd?.needsWallet) {
        toast({ title: "No crypto wallet", description: "Create one in the Crypto Wallet page first.", variant: "destructive" });
        return;
      }
      if (pd?.error === "insufficient") {
        toast({ title: "Insufficient wallet balance", description: `You have ${pd.balance} ${pd.token} on ${pd.chain}, need ${pd.needed}.`, variant: "destructive" });
        return;
      }
      if (pd?.error) {
        toast({ title: "Donation failed", description: pd.error, variant: "destructive" });
        return;
      }
      await base44.entities.Draw.update(draw.id, {
        charityContribution: +((draw.charityContribution || 0) + amt).toFixed(2),
      });
      setDone({ amount: amt, txHash: pd.txHash });
      setAmount("");
      onDonated?.();
      toast({ title: "Thank you!", description: `${fmtUSD(amt)} donated to the charity pool. No ticket issued, no GOV minted.` });
    } catch (e) {
      toast({ title: "Donation failed", description: e.message, variant: "destructive" });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="rounded-2xl border border-accent/40 bg-accent/5 p-6 shadow-sm">
      <div className="flex items-center gap-2">
        <Heart className="h-5 w-5 text-accent" />
        <h2 className="text-lg font-bold">Donate to the Charity Pool</h2>
      </div>
      <p className="mt-1 text-sm text-muted-foreground">
        Support Rotary impact projects without entering the draw. 100% of your donation goes straight to the charity fund — no ticket, no GOV tokens minted.
      </p>
      <div className="mt-4 grid gap-3 sm:grid-cols-[1fr_auto_auto]">
        <InteractiveInput
          type="number"
          min="0.01"
          step="0.01"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          placeholder="Amount (USD)"
          className="w-full"
        />
        <select value={chain} onChange={(e) => setChain(e.target.value)} className="h-10 rounded-lg border border-input bg-background px-2 text-sm">
          {CHAINS.map((c) => <option key={c.key} value={c.key}>{c.name}</option>)}
        </select>
        <select value={token} onChange={(e) => setToken(e.target.value)} className="h-10 rounded-lg border border-input bg-background px-2 text-sm">
          <option value="USDC">USDC</option>
          <option value="USDT">USDT</option>
        </select>
      </div>
      <button
        onClick={donate}
        disabled={busy || !amount || Number(amount) <= 0}
        className="mt-4 flex w-full items-center justify-center gap-2 rounded-xl bg-gold-gradient py-3 text-sm font-bold text-primary-foreground shadow-lg transition-transform hover:scale-[1.01] disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:scale-100"
      >
        {busy ? <div className="h-4 w-4 animate-spin rounded-full border-2 border-primary-foreground/40 border-t-primary-foreground" /> : <Heart className="h-4 w-4" />}
        {busy ? "Processing…" : `Donate${amount ? " " + fmtUSD(Number(amount)) : ""}`}
      </button>
      {done && (
        <div className="mt-3 flex items-center gap-2 rounded-lg bg-emerald-50 p-3 text-sm text-emerald-700">
          <BadgeCheck className="h-4 w-4 shrink-0" />
          <span>Thank you — {fmtUSD(done.amount)} sent to the charity pool. Tx {done.txHash?.slice(0, 12)}…</span>
        </div>
      )}
    </div>
  );
}