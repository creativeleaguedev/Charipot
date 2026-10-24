import React, { useState } from "react";
import { base44 } from "@/api/base44Client";
import { useToast } from "@/components/ui/use-toast";
import { CHAINS } from "@/lib/chains";
import { Loader2, Plus, X } from "lucide-react";

// Collapsible control that lets a user track any ERC20 token by pasting its
// contract address on BNB / Ethereum / Polygon. The backend validates the
// contract on-chain and persists it to the wallet; `onAdded` re-syncs balances.
export default function AddCustomToken({ onAdded }) {
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [chain, setChain] = useState("bnb");
  const [address, setAddress] = useState("");
  const [adding, setAdding] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    const addr = address.trim();
    if (!/^0x[a-fA-F0-9]{40}$/.test(addr)) {
      toast({ title: "Enter a valid ERC20 contract address (0x…)", variant: "destructive" });
      return;
    }
    setAdding(true);
    try {
      const res = await base44.functions.invoke("manageCustomToken", { action: "add", chain, address: addr });
      const d = res.data;
      if (d?.error) {
        toast({ title: "Could not add token", description: d.error, variant: "destructive" });
      } else {
        toast({ title: "Token added", description: `${d.symbol || ""} on ${chain}` });
        setAddress("");
        setOpen(false);
        onAdded?.();
      }
    } catch (err) {
      toast({ title: "Could not add token", description: err.message, variant: "destructive" });
    }
    setAdding(false);
  };

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="mt-3 flex w-full items-center justify-center gap-2 rounded-2xl border border-dashed border-white/15 py-3 text-sm font-medium text-white/60 transition-colors hover:bg-white/5 hover:text-white"
      >
        <Plus className="h-4 w-4" /> Add Custom Token
      </button>
    );
  }

  return (
    <form onSubmit={submit} className="mt-3 rounded-2xl border border-white/10 bg-white/[0.03] p-4">
      <div className="flex items-center justify-between">
        <p className="text-sm font-semibold text-white">Add Custom Token</p>
        <button type="button" onClick={() => setOpen(false)} className="rounded-md p-1 text-white/50 hover:bg-white/10 hover:text-white">
          <X className="h-4 w-4" />
        </button>
      </div>
      <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-[1fr_2fr]">
        <select value={chain} onChange={(e) => setChain(e.target.value)} className="h-9 rounded-md border border-white/10 bg-white/5 px-2 text-sm text-white">
          {CHAINS.map((c) => <option key={c.key} value={c.key} className="text-black">{c.name}</option>)}
        </select>
        <input
          value={address}
          onChange={(e) => setAddress(e.target.value)}
          placeholder="0x… contract address"
          className="h-9 w-full rounded-md border border-white/10 bg-white/5 px-2 text-sm text-white placeholder:text-white/30"
        />
      </div>
      <p className="mt-2 text-[11px] text-white/40">Paste any ERC20 token's contract address. Its live balance for your wallet will be tracked here.</p>
      <button type="submit" disabled={adding} className="mt-3 flex w-full items-center justify-center gap-2 rounded-full bg-white py-2.5 text-sm font-bold text-black disabled:opacity-70">
        {adding ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />} Add Token
      </button>
    </form>
  );
}