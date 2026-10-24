import React, { useState } from "react";
import { base44 } from "@/api/base44Client";
import { useToast } from "@/components/ui/use-toast";
import { UserCheck, Lock, Loader2, BadgeCheck } from "lucide-react";
import { InteractiveInput } from "@/components/ui/interactive-input";

const HOUSE_CODE = "ROTARY-DEN-33";

// Top-right referral code panel for the Play page. Shows the user's locked-in
// referrer (permanent once set) or an input to lock one in. Falls back to the
// house agent code so unattributed tickets still credit the 2% referral.
export default function ReferralCodeCard({ wallet, onLocked }) {
  const { toast } = useToast();
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const locked = !!wallet?.referrerCode;
  const active = wallet?.referrerCode || HOUSE_CODE;

  const lock = async () => {
    if (!code.trim()) return toast({ title: "Enter a referral code", variant: "destructive" });
    setBusy(true);
    try {
      const res = await base44.functions.invoke("lockReferrerCode", { code: code.trim() });
      const d = res.data;
      if (d?.error === "already_locked") {
        toast({ title: "Referrer already locked" });
        onLocked?.();
      } else if (d?.error === "own_code") {
        toast({ title: "That's your own code", description: "You can't refer yourself — enter a different invitation code.", variant: "destructive" });
      } else if (d?.error === "invalid_code") {
        toast({ title: "Invalid referral code", description: "No agent uses that referral code.", variant: "destructive" });
      } else if (d?.error) {
        toast({ title: "Could not lock code", description: d.error, variant: "destructive" });
      } else {
        toast({ title: "Referrer locked", description: `${d.referrerCode} is now your permanent referrer.` });
        setCode("");
        onLocked?.();
      }
    } catch (e) {
      toast({ title: "Could not lock code", description: e.message, variant: "destructive" });
    }
    setBusy(false);
  };

  return (
    <div className="w-full max-w-sm rounded-2xl border border-border bg-card p-4 shadow-sm">
      <div className="flex items-center justify-between">
        <h3 className="flex items-center gap-1.5 text-sm font-bold"><UserCheck className="h-4 w-4 text-accent" /> Your Referrer</h3>
        {locked ? (
          <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-semibold text-emerald-700"><Lock className="h-3 w-3" /> Locked</span>
        ) : null}
      </div>
      {locked ? (
        <div className="mt-2 flex items-center gap-2 rounded-lg bg-muted/60 px-3 py-2">
          <BadgeCheck className="h-4 w-4 text-emerald-600" />
          <code className="font-mono text-sm font-semibold">{active}</code>
          <span className="ml-auto text-[10px] text-muted-foreground">permanent</span>
        </div>
      ) : (
        <>
          <p className="mt-1.5 text-[11px] text-muted-foreground">Enter a valid invitation code to lock in your referrer — this is permanent.</p>
          <div className="mt-2 flex gap-2">
            <InteractiveInput value={code} onChange={(e) => setCode(e.target.value)} placeholder="Enter invitation code" className="w-full uppercase" />
            <button onClick={lock} disabled={busy} className="inline-flex shrink-0 items-center gap-1.5 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:bg-primary/90 disabled:opacity-50">
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Lock className="h-4 w-4" />} Lock
            </button>
          </div>
        </>
      )}
    </div>
  );
}