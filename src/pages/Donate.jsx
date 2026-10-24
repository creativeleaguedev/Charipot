import React, { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { useWallet } from "@/lib/useWallet";
import { fmtUSD, loadConfig, allocateRevenue } from "@/lib/configRegistry";
import { useLang } from "@/lib/LanguageContext";
import { useToast } from "@/components/ui/use-toast";
import { CHAINS, getChain } from "@/lib/chains";
import CryptoLogo from "@/components/ui/CryptoLogo";
import { Heart, Copy, ShieldCheck, Loader2, Wallet, ScanLine, Search, CheckCircle2, AlertTriangle, Clock } from "lucide-react";
import { cn } from "@/lib/utils";
import { InteractiveInput } from "@/components/ui/interactive-input";

// Donation wallet — destination for all donations. Looked up from the platform
// wallet registry so the custody address can be rotated from the Admin Center.
const DONATION_FALLBACK = "0x52C2EBF9D6e589eB6a9F16b079Ee46f0AE83eC7f";

export default function Donate() {
  const { user, wallet, refresh } = useWallet();
  const { t } = useLang();
  const [draw, setDraw] = useState(null);
  const [mode, setMode] = useState("wallet");
  const [amount, setAmount] = useState("");
  const [chain, setChain] = useState("bnb");
  const [token, setToken] = useState("USDC");
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(null);
  const [donationAddress, setDonationAddress] = useState(DONATION_FALLBACK);

  // Verification state
  const [verifyInput, setVerifyInput] = useState("");
  const [verifyChain, setVerifyChain] = useState("bnb");
  const [verifying, setVerifying] = useState(false);
  const [verifyResult, setVerifyResult] = useState(null);
  const { toast } = useToast();

  useEffect(() => {
    (async () => {
      const draws = await base44.entities.Draw.list("-drawNumber", 10);
      const active = draws.find((d) => d.status === "BUILDING" || d.status === "MINIMUM_REACHED" || d.status === "TARGET_REACHED") || draws[0];
      setDraw(active);
    })();
  }, []);

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
    toast({ title: t("donate.copied") });
  };

  const donateFromWallet = async () => {
    const amt = Number(amount);
    if (!draw || !Number.isFinite(amt) || amt <= 0) return;
    setBusy(true);
    try {
      const payRes = await base44.functions.invoke("payToTreasury", {
        amount: amt, chain, token, purpose: "DONATION",
        reference: "donation_draw_" + draw.drawNumber,
      });
      const pd = payRes.data;
      if (pd?.needsWallet) {
        toast({ title: t("donate.no_wallet_title"), description: t("donate.no_wallet_desc"), variant: "destructive" });
        return;
      }
      if (pd?.error === "insufficient") {
        toast({ title: t("donate.insufficient_title"), description: t("donate.insufficient_desc", { balance: pd.balance, token: pd.token, chain: pd.chain, needed: pd.needed }), variant: "destructive" });
        return;
      }
      if (pd?.error) {
        toast({ title: t("donate.failed_title"), description: pd.error, variant: "destructive" });
        return;
      }
      const cfg = await loadConfig();
      const a = allocateRevenue(amt, cfg);
      await base44.entities.Draw.update(draw.id, {
        charityContribution: +((draw.charityContribution || 0) + a.charity).toFixed(2),
        jackpotAmount: +((draw.jackpotAmount || 0) + a.jackpotAdd).toFixed(2),
        reserveAllocation: +((draw.reserveAllocation || 0) + a.reservePortion).toFixed(2),
        reserveBalance: +((draw.reserveBalance || 0) + a.reservePortion).toFixed(2),
      });
      setDone({ amount: amt, mode: "wallet", txHash: pd.txHash, split: a });
      setAmount("");
      refresh();
      toast({ title: t("donate.thank_title"), description: t("donate.thank_desc", { amount: fmtUSD(amt), charity: fmtUSD(a.charity), jackpot: fmtUSD(a.jackpotAdd), reserve: fmtUSD(a.reservePortion) }) });
    } catch (e) {
      toast({ title: t("donate.failed_title"), description: e.message, variant: "destructive" });
    } finally {
      setBusy(false);
    }
  };

  const recordDirectDeposit = async () => {
    const amt = Number(amount);
    if (!draw || !Number.isFinite(amt) || amt <= 0) return;
    setBusy(true);
    try {
      await base44.entities.CryptoTransaction.create({
        userId: user.id,
        fullName: user.full_name || user.email,
        type: "DONATION",
        chain, token,
        amount: amt,
        fromAddress: wallet?.walletAddress || "",
        toAddress: donationAddress,
        status: "PENDING",
        reference: "direct_donation_draw_" + draw.drawNumber,
        createdAt: new Date().toISOString(),
      });
      await base44.entities.Notification.create({
        title: "Direct donation awaiting confirmation",
        message: `${user.full_name || user.email} sent ${amt} ${token} on ${chain} to the treasury for Draw #${draw.drawNumber}. Verify on-chain and credit the charity pool.`,
        type: "treasury",
        createdAt: new Date().toISOString(),
      });
      setDone({ amount: amt, mode: "direct" });
      setAmount("");
      toast({ title: t("donate.deposit_recorded_title"), description: t("donate.deposit_recorded_desc") });
    } catch (e) {
      toast({ title: t("donate.failed_generic"), description: e.message, variant: "destructive" });
    } finally {
      setBusy(false);
    }
  };

  const verifyDonation = async () => {
    const v = verifyInput.trim();
    if (!v) return;
    const isAddress = /^0x[a-fA-F0-9]{40}$/.test(v);
    const isHash = /^0x[a-fA-F0-9]{64}$/.test(v);
    if (!isAddress && !isHash) {
      toast({ title: t("donate.invalid_input"), description: t("donate.invalid_desc"), variant: "destructive" });
      return;
    }
    setVerifying(true);
    setVerifyResult(null);
    try {
      const payload = isHash ? { txHash: v, chain: verifyChain } : { walletAddress: v };
      const res = await base44.functions.invoke("verifyDonationTx", payload);
      const d = res.data;
      if (d?.error) {
        toast({ title: t("donate.verify_failed"), description: d.error, variant: "destructive" });
        return;
      }
      setVerifyResult(d);
      if (d?.mode === "tx" && d?.confirmed && d?.toTreasury) {
        toast({ title: t("donate.verified_title"), description: t("donate.verified_desc", { amount: d.amount, token: d.token }) });
      }
    } catch (e) {
      toast({ title: t("donate.verify_failed"), description: e.message, variant: "destructive" });
    } finally {
      setVerifying(false);
    }
  };

  const submit = mode === "wallet" ? donateFromWallet : recordDirectDeposit;
  const canSubmit = !!amount && Number(amount) > 0 && !busy;

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div className="flex items-center gap-3">
        <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-gold-gradient text-primary-foreground">
          <Heart className="h-6 w-6" />
        </div>
        <div>
          <h1 className="text-2xl font-bold tracking-tight">{t("donate.title")}</h1>
          <p className="text-sm text-muted-foreground">{t("donate.subtitle")}</p>
        </div>
      </div>

      {/* Donation Wallet + QR (top) */}
      <div className="rounded-2xl border border-border bg-card p-6 shadow-sm">
        <div className="flex items-center gap-2">
          <ShieldCheck className="h-5 w-5 text-primary" />
          <h2 className="text-lg font-bold">{t("donate.wallet_card")}</h2>
        </div>
        <p className="mt-1 text-sm text-muted-foreground">{t("donate.wallet_desc")}</p>
        <div className="mt-4 flex flex-col items-center gap-4 sm:flex-row sm:items-start sm:gap-6">
          <div className="shrink-0 rounded-xl border border-border bg-white p-3">
            <img
              src={`https://api.qrserver.com/v1/create-qr-code/?size=180x180&bgcolor=ffffff&data=${encodeURIComponent(donationAddress)}`}
              alt="Donation wallet QR" className="h-44 w-44"
              onError={(e) => { e.currentTarget.style.display = "none"; }}
            />
          </div>
          <div className="flex-1 space-y-3">
            <div>
              <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{t("donate.address_label")}</p>
              <div className="mt-1 flex items-center gap-2 rounded-lg border border-border bg-muted p-2.5">
                <code className="flex-1 break-all text-xs">{donationAddress}</code>
                <button onClick={() => copy(donationAddress)} className="shrink-0 rounded-md p-1.5 hover:bg-muted-foreground/10"><Copy className="h-3.5 w-3.5" /></button>
              </div>
            </div>
            <div>
              <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{t("donate.networks_label")}</p>
              <div className="mt-1 flex flex-wrap gap-2">
                {CHAINS.map((c) => (
                  <span key={c.key} className="inline-flex items-center gap-1.5 rounded-full border border-border bg-muted px-2.5 py-1 text-xs font-medium">
                    <CryptoLogo src={c.logo} alt={c.name} color={c.color} className="h-3.5 w-3.5" /> {c.name}
                  </span>
                ))}
                <span className="inline-flex items-center gap-1.5 rounded-full border border-accent/40 bg-accent/10 px-2.5 py-1 text-xs font-semibold text-accent">{t("donate.usdt_only")}</span>
              </div>
            </div>
            <p className="text-xs text-muted-foreground">{t("donate.draw_pool", { n: draw?.drawNumber ?? "—", pool: fmtUSD(draw?.charityContribution || 0) })}</p>
          </div>
        </div>
      </div>

      {/* Mode toggle */}
      <div className="inline-flex rounded-xl border border-border bg-card p-1 shadow-sm">
        <button
          onClick={() => setMode("wallet")}
          className={cn("inline-flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-semibold transition-colors", mode === "wallet" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground")}
        >
          <Wallet className="h-4 w-4" /> {t("donate.pay_wallet")}
        </button>
        <button
          onClick={() => setMode("direct")}
          className={cn("inline-flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-semibold transition-colors", mode === "direct" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground")}
        >
          <ScanLine className="h-4 w-4" /> {t("donate.deposit_direct")}
        </button>
      </div>

      {/* Amount + chain/token */}
      <div className="rounded-2xl border border-border bg-card p-6 shadow-sm">
        <h2 className="text-lg font-bold">
          {mode === "wallet" ? t("donate.amount_wallet") : t("donate.amount_direct")}
        </h2>
        <div className="mt-4 grid gap-3 sm:grid-cols-[1fr_auto_auto]">
          <InteractiveInput
            type="number" min="0.01" step="0.01" value={amount}
            onChange={(e) => setAmount(e.target.value)} placeholder={t("donate.amount_placeholder")}
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
        <p className="mt-2 text-xs text-muted-foreground">
          {mode === "wallet"
            ? t("donate.desc_wallet", { token, chain: getChain(chain)?.name })
            : t("donate.desc_direct", { token, chain: getChain(chain)?.name })}
        </p>
        <button
          onClick={submit} disabled={!canSubmit}
          className="mt-4 flex w-full items-center justify-center gap-2 rounded-xl bg-gold-gradient py-3 text-sm font-bold text-primary-foreground shadow-lg transition-transform hover:scale-[1.01] btn-heat disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:scale-100"
        >
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Heart className="h-4 w-4" />}
          {busy ? t("donate.processing") : mode === "wallet"
            ? (amount ? t("donate.donate_amount", { amount: fmtUSD(Number(amount)) }) : t("donate.donate_btn"))
            : (amount ? t("donate.sent_amount", { amount: fmtUSD(Number(amount)) }) : t("donate.sent_btn"))}
        </button>
      </div>

      {/* On-chain verification */}
      <div className="rounded-2xl border border-border bg-card p-6 shadow-sm">
        <div className="flex items-center gap-2">
          <Search className="h-5 w-5 text-primary" />
          <h2 className="text-lg font-bold">{t("donate.verify_title")}</h2>
        </div>
        <p className="mt-1 text-sm text-muted-foreground">{t("donate.verify_desc")}</p>
        <div className="mt-4 grid gap-3 sm:grid-cols-[1fr_auto_auto]">
          <InteractiveInput
            value={verifyInput}
            onChange={(e) => setVerifyInput(e.target.value)}
            placeholder={t("donate.verify_placeholder")}
            className="w-full font-mono"
          />
          <select value={verifyChain} onChange={(e) => setVerifyChain(e.target.value)} className="h-10 rounded-lg border border-input bg-background px-2 text-sm">
            {CHAINS.map((c) => <option key={c.key} value={c.key}>{c.name}</option>)}
          </select>
          <button
            onClick={verifyDonation} disabled={verifying || !verifyInput.trim()}
            className="inline-flex h-10 items-center justify-center gap-2 rounded-lg bg-primary px-4 text-sm font-semibold text-primary-foreground hover:bg-primary/90 btn-heat disabled:cursor-not-allowed disabled:opacity-50"
          >
            {verifying ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />} {t("donate.verify_btn")}
          </button>
        </div>
        <p className="mt-2 text-xs text-muted-foreground">{t("donate.verify_note")}</p>

        {verifyResult && (
          <div className="mt-4">
            {verifyResult.mode === "tx" && (
              verifyResult.pending ? (
                <div className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-700">
                  <Clock className="mt-0.5 h-4 w-4" /> {t("donate.pending")}
                </div>
              ) : verifyResult.confirmed && verifyResult.toTreasury ? (
                <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-700">
                  <div className="flex items-center gap-2 font-semibold"><CheckCircle2 className="h-4 w-4" /> {t("donate.confirmed_treasury")}</div>
                  <p className="mt-1">{t("donate.confirmed_line", { amount: verifyResult.amount, token: verifyResult.token, chain: getChain(verifyResult.chain)?.name, addr: `${verifyResult.fromAddress?.slice(0,10)}…` })}</p>
                  <p className="mt-1 text-xs">{t("donate.block_line", { n: verifyResult.blockNumber })}</p>
                </div>
              ) : verifyResult.confirmed && !verifyResult.toTreasury ? (
                <div className="flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
                  <AlertTriangle className="mt-0.5 h-4 w-4" /> {t("donate.not_found")}
                </div>
              ) : (
                <div className="flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
                  <AlertTriangle className="mt-0.5 h-4 w-4" /> {t("donate.reverted")}
                </div>
              )
            )}
            {verifyResult.mode === "wallet" && (
              <div className="rounded-lg border border-border bg-muted/40 p-3 text-sm">
                <p className="font-medium text-foreground">{t("donate.recent_title")}</p>
                {verifyResult.transfers?.length ? (
                  <ul className="mt-2 space-y-1.5">
                    {verifyResult.transfers.map((tr, i) => (
                      <li key={i} className="flex items-center justify-between gap-2 text-xs">
                        <span className="font-mono text-muted-foreground">{tr.txHash.slice(0,18)}…</span>
                        <span className="font-semibold">{tr.amount} {tr.token}</span>
                        <span className="text-muted-foreground">{getChain(tr.chain)?.name}</span>
                        <span className={cn("rounded px-1.5 py-0.5 text-[10px] font-semibold", tr.confirmed ? "bg-emerald-100 text-emerald-700" : "bg-amber-100 text-amber-700")}>{tr.confirmed ? t("donate.confirmed_badge") : t("donate.pending_badge")}</span>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="mt-2 text-muted-foreground">{t("donate.no_transfers")}</p>
                )}
              </div>
            )}
          </div>
        )}
      </div>

      {done && (
        <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-5">
          <div className="flex items-center gap-2 text-emerald-700">
            <CheckCircle2 className="h-5 w-5" />
            <p className="font-bold">{done.mode === "wallet" ? t("donate.done_wallet_title") : t("donate.done_direct_title")}</p>
          </div>
          <p className="mt-2 text-sm text-emerald-700">
            {done.mode === "wallet"
              ? t("donate.done_wallet_desc", { amount: fmtUSD(done.amount) })
              : t("donate.done_direct_desc", { amount: fmtUSD(done.amount) })}
          </p>
          {done.txHash && <p className="mt-1 text-xs text-emerald-600">{t("donate.tx", { hash: `${done.txHash.slice(0, 18)}…` })}</p>}
        </div>
      )}
    </div>
  );
}