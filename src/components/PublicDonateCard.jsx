import React, { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { useToast } from "@/components/ui/use-toast";
import { CHAINS, getChain } from "@/lib/chains";
import CryptoLogo from "@/components/ui/CryptoLogo";
import { Heart, Copy, ShieldCheck, Search, Loader2, CheckCircle2, AlertTriangle, Clock, ScanLine } from "lucide-react";
import { cn } from "@/lib/utils";
import { InteractiveInput } from "@/components/ui/interactive-input";

// Public, account-free crypto donation card for the landing page. Visitors
// send USDC/USDT from their own wallet to the Donation Wallet address (QR shown),
// then verify the on-chain transfer here — no login required. Confirmed transfers
// are credited to the charity pool server-side by verifyPublicDonation.
const DONATION_FALLBACK = "0x52C2EBF9D6e589eB6a9F16b079Ee46f0AE83eC7f";

export default function PublicDonateCard() {
  const [verifyInput, setVerifyInput] = useState("");
  const [verifyChain, setVerifyChain] = useState("bnb");
  const [verifying, setVerifying] = useState(false);
  const [result, setResult] = useState(null);
  const [donationAddress, setDonationAddress] = useState(DONATION_FALLBACK);
  const { toast } = useToast();

  useEffect(() => {
    (async () => {
      try {
        const res = await base44.functions.invoke("getPlatformWallets", {});
        const w = res.data?.wallets?.find((x) => x.key === "donation");
        if (w?.address) setDonationAddress(w.address);
      } catch (_) {}
    })();
  }, []);

  const copy = (text) => {
    navigator.clipboard.writeText(text);
    toast({ title: "Copied to clipboard" });
  };

  const verify = async () => {
    const v = verifyInput.trim();
    if (!v) return;
    const isAddress = /^0x[a-fA-F0-9]{40}$/.test(v);
    const isHash = /^0x[a-fA-F0-9]{64}$/.test(v);
    if (!isAddress && !isHash) {
      toast({ title: "Invalid input", description: "Enter a transaction hash (0x…) or wallet address (0x…).", variant: "destructive" });
      return;
    }
    setVerifying(true);
    setResult(null);
    try {
      const payload = isHash ? { txHash: v, chain: verifyChain } : { walletAddress: v };
      const res = await base44.functions.invoke("verifyPublicDonation", payload);
      const d = res.data;
      if (d?.error) {
        toast({ title: "Verification failed", description: d.error, variant: "destructive" });
        return;
      }
      setResult(d);
      if (d?.mode === "tx" && d?.confirmed && d?.toTreasury) {
        toast({ title: "Verified on-chain", description: `${d.amount} ${d.token} confirmed to the treasury and credited to the charity pool. Thank you!` });
      }
    } catch (e) {
      toast({ title: "Verification failed", description: e.message, variant: "destructive" });
    } finally {
      setVerifying(false);
    }
  };

  return (
    <div className="rounded-2xl border border-accent/40 bg-card p-6 shadow-sm">
      <div className="flex items-center gap-2">
        <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-gold-gradient text-primary-foreground">
          <Heart className="h-5 w-5" />
        </div>
        <div>
          <h2 className="text-lg font-bold">Donate crypto — no account needed</h2>
          <p className="text-xs text-muted-foreground">Send USDC or USDT from any wallet to the Donation Wallet below, then verify it to credit the charity pool.</p>
        </div>
      </div>

      <div className="mt-4 flex flex-col items-center gap-4 sm:flex-row sm:items-start sm:gap-6">
        <div className="shrink-0 rounded-xl border border-border bg-white p-3">
          <img
            src={`https://api.qrserver.com/v1/create-qr-code/?size=180x180&bgcolor=ffffff&data=${encodeURIComponent(donationAddress)}`}
            alt="Donation wallet QR"
            className="h-40 w-40"
            onError={(e) => { e.currentTarget.style.display = "none"; }}
          />
        </div>
        <div className="flex-1 space-y-3">
          <div>
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Donation address</p>
            <div className="mt-1 flex items-center gap-2 rounded-lg border border-border bg-muted p-2.5">
              <code className="flex-1 break-all text-xs">{donationAddress}</code>
              <button onClick={() => copy(donationAddress)} className="shrink-0 rounded-md p-1.5 hover:bg-muted-foreground/10"><Copy className="h-3.5 w-3.5" /></button>
            </div>
          </div>
          <div>
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Accepted networks</p>
            <div className="mt-1 flex flex-wrap gap-2">
              {CHAINS.map((c) => (
                <span key={c.key} className="inline-flex items-center gap-1.5 rounded-full border border-border bg-muted px-2.5 py-1 text-xs font-medium">
                  <CryptoLogo src={c.logo} alt={c.name} color={c.color} className="h-3.5 w-3.5" /> {c.name}
                </span>
              ))}
              <span className="inline-flex items-center gap-1.5 rounded-full border border-accent/40 bg-accent/10 px-2.5 py-1 text-xs font-semibold text-accent">USDC / USDT only</span>
            </div>
          </div>
          <p className="flex items-start gap-1.5 text-xs text-muted-foreground">
            <ShieldCheck className="mt-0.5 h-3.5 w-3.5 shrink-0 text-primary" />
            Send only on the networks above — wrong-chain transfers may be lost. Your donation is split across charity, jackpot, and reserve just like ticket sales.
          </p>
        </div>
      </div>

      {/* On-chain verification */}
      <div className="mt-5 rounded-xl border border-border bg-muted/30 p-4">
        <div className="flex items-center gap-2">
          <ScanLine className="h-4 w-4 text-primary" />
          <h3 className="text-sm font-bold">Verify your donation on-chain</h3>
        </div>
        <p className="mt-1 text-xs text-muted-foreground">Enter your transaction hash or sender wallet address to confirm the funds reached the treasury.</p>
        <div className="mt-3 grid gap-2 sm:grid-cols-[1fr_auto_auto]">
          <InteractiveInput
            value={verifyInput}
            onChange={(e) => setVerifyInput(e.target.value)}
            placeholder="Transaction hash (0x…) or wallet address (0x…)"
            className="w-full font-mono"
          />
          <select value={verifyChain} onChange={(e) => setVerifyChain(e.target.value)} className="h-10 rounded-lg border border-input bg-background px-2 text-sm">
            {CHAINS.map((c) => <option key={c.key} value={c.key}>{c.name}</option>)}
          </select>
          <button
            onClick={verify} disabled={verifying || !verifyInput.trim()}
            className="inline-flex h-10 items-center justify-center gap-2 rounded-lg bg-primary px-4 text-sm font-semibold text-primary-foreground hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {verifying ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />} Verify
          </button>
        </div>
        <p className="mt-2 text-[11px] text-muted-foreground">The chain selector applies to transaction-hash lookups. Wallet-address lookups scan all supported chains automatically.</p>

        {result && (
          <div className="mt-3">
            {result.mode === "tx" && (
              result.pending ? (
                <div className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-700">
                  <Clock className="mt-0.5 h-4 w-4" /> Transaction not mined yet — it may still be pending on-chain. Check again shortly.
                </div>
              ) : result.confirmed && result.toTreasury ? (
                <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-700">
                  <div className="flex items-center gap-2 font-semibold"><CheckCircle2 className="h-4 w-4" /> Confirmed to donation wallet — thank you!</div>
                  <p className="mt-1">{result.amount} {result.token} on {getChain(result.chain)?.name} · from <span className="font-mono">{result.fromAddress?.slice(0,10)}…</span></p>
                  <p className="mt-1 text-xs">Block #{result.blockNumber} · Charity pool credited.</p>
                </div>
              ) : result.confirmed && !result.toTreasury ? (
                <div className="flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
                  <AlertTriangle className="mt-0.5 h-4 w-4" /> Transaction confirmed but no USDC/USDT transfer to the treasury was found in it.
                </div>
              ) : (
                <div className="flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
                  <AlertTriangle className="mt-0.5 h-4 w-4" /> Transaction failed (reverted) on-chain.
                </div>
              )
            )}
            {result.mode === "wallet" && (
              <div className="rounded-lg border border-border bg-background p-3 text-sm">
                <p className="font-medium text-foreground">Recent transfers to treasury from this address</p>
                {result.transfers?.length ? (
                  <ul className="mt-2 space-y-1.5">
                    {result.transfers.map((t, i) => (
                      <li key={i} className="flex items-center justify-between gap-2 text-xs">
                        <span className="font-mono text-muted-foreground">{t.txHash.slice(0,18)}…</span>
                        <span className="font-semibold">{t.amount} {t.token}</span>
                        <span className="text-muted-foreground">{getChain(t.chain)?.name}</span>
                        <span className={cn("rounded px-1.5 py-0.5 text-[10px] font-semibold", t.confirmed ? "bg-emerald-100 text-emerald-700" : "bg-amber-100 text-amber-700")}>{t.confirmed ? "Confirmed" : "Pending"}</span>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="mt-2 text-muted-foreground">No recent transfers to the treasury found from this address.</p>
                )}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}