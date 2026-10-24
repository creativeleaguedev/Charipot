import React, { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { fmtUSD, fmtNum } from "@/lib/configRegistry";
import { CHAINS, TOKEN_LOGOS, shortAddr, addrUrl } from "@/lib/chains";
import { Heart, Copy, ExternalLink, Wallet, RefreshCw } from "lucide-react";
import { useToast } from "@/components/ui/use-toast";

// Live charity wallet card: shows the platform's public charity/treasury
// wallet address and its live on-chain USDC/USDT balance across all chains,
// read directly from the blockchain via the getCharityWallet backend function.
// Used on the Home and public Landing pages for transparency.
export default function CharityWalletCard({ compact = false }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const { toast } = useToast();

  const load = async (silent = false) => {
    if (silent) setRefreshing(true); else setLoading(true);
    try {
      const res = await base44.functions.invoke("getCharityWallet", {});
      if (res.data?.address) setData(res.data);
    } catch (_) {}
    setLoading(false);
    setRefreshing(false);
  };

  useEffect(() => { load(); }, []);

  const copy = (text) => {
    navigator.clipboard.writeText(text);
    toast({ title: "Address copied" });
  };

  if (loading) {
    return (
      <div className="rounded-2xl border border-accent/30 bg-accent/5 p-5 shadow-sm">
        <div className="h-20 animate-pulse rounded-lg bg-muted/60" />
      </div>
    );
  }

  const addr = data?.address || "";
  const total = data?.total || 0;

  return (
    <div className="rounded-2xl border border-accent/30 bg-accent/5 p-5 shadow-sm">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-accent/15 text-accent"><Heart className="h-5 w-5" /></div>
          <div>
            <h3 className="text-sm font-bold">Charity Wallet · Live on-chain</h3>
            <p className="text-[11px] text-muted-foreground">Receive-only · verifiable on every chain</p>
          </div>
        </div>
        <button onClick={() => load(true)} className="rounded-md p-1.5 text-muted-foreground hover:bg-muted hover:text-accent" title="Refresh balance">
          <RefreshCw className={`h-4 w-4 ${refreshing ? "animate-spin" : ""}`} />
        </button>
      </div>

      <div className="mt-4 flex items-end justify-between gap-3">
        <div>
          <p className="text-xs text-muted-foreground">Live balance (USDC + USDT)</p>
          <p className="text-3xl font-bold text-accent">{fmtUSD(total)}</p>
        </div>
        <div className="text-right text-xs text-muted-foreground">
          <p>USDC: {fmtNum(data?.totalUsdc || 0)}</p>
          <p>USDT: {fmtNum(data?.totalUsdt || 0)}</p>
        </div>
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-2 rounded-lg border border-border bg-background px-3 py-2">
        <Wallet className="h-4 w-4 shrink-0 text-primary" />
        <code className="flex-1 truncate text-xs">{addr}</code>
        <button onClick={() => copy(addr)} className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground"><Copy className="h-3.5 w-3.5" /></button>
        <a href={addrUrl("bnb", addr)} target="_blank" rel="noreferrer" className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground"><ExternalLink className="h-3.5 w-3.5" /></a>
      </div>

      {!compact && data?.chains && (
        <div className="mt-3 grid grid-cols-3 gap-2">
          {data.chains.map((c) => {
            const chain = CHAINS.find((x) => x.key === c.chain);
            return (
              <div key={c.chain} className="rounded-lg border border-border bg-background p-2.5">
                <div className="flex items-center gap-1.5">
                  {chain?.logo && <img src={chain.logo} alt={c.chain} className="h-4 w-4 rounded-full" />}
                  <span className="text-[11px] font-semibold">{chain?.name || c.chain}</span>
                </div>
                <div className="mt-1.5 space-y-0.5 text-[11px] text-muted-foreground">
                  <p className="flex items-center gap-1"><img src={TOKEN_LOGOS.USDC} alt="" className="h-3 w-3" /> {fmtNum(Number(c.balances?.USDC || 0))}</p>
                  <p className="flex items-center gap-1"><img src={TOKEN_LOGOS.USDT} alt="" className="h-3 w-3" /> {fmtNum(Number(c.balances?.USDT || 0))}</p>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}