import React, { useState } from "react";
import { Ban, X, AlertTriangle, LifeBuoy } from "lucide-react";
import { base44 } from "@/api/base44Client";
import { useToast } from "@/components/ui/use-toast";

const SUPPORT_EMAIL = "care@rotaryimpact.org";

// Professional centered modal that replaces the native window.prompt() used for
// blacklisting a user or wallet. Collects a reason, applies the blacklist (via
// onDone), then emails + notifies the affected user with the reason and a
// Customer Care contact.
export default function BlacklistModal({ open, target, targetType, onClose, onDone }) {
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const { toast } = useToast();

  if (!open || !target) return null;

  const isWallet = targetType === "wallet";
  const label = isWallet
    ? target.fullName || target.walletAddress || "this wallet"
    : target.full_name || target.email;

  const submit = async () => {
    const r = reason.trim();
    if (!r) {
      toast({ title: "Reason required", description: "Please enter a reason for blacklisting.", variant: "destructive" });
      return;
    }
    setBusy(true);
    try {
      // 1. Apply the blacklist + audit log (handled by the parent panel).
      await onDone(r);
      // 2. Notify the affected user by email + in-app (server-side).
      try {
        await base44.functions.invoke("notifyBlacklist", {
          userId: target.userId || target.id,
          email: target.email || "",
          fullName: target.full_name || target.fullName || "",
          targetType,
          reason: r,
        });
      } catch (e) {
        toast({ title: "Notification failed", description: e.message, variant: "destructive" });
      }
      setReason("");
      onClose();
    } catch (e) {
      toast({ title: "Blacklist failed", description: e.message, variant: "destructive" });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 p-4" onClick={onClose}>
      <div
        className="w-full max-w-md rounded-2xl border border-border bg-card p-6 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-3">
            <span className="flex h-10 w-10 items-center justify-center rounded-full bg-destructive/10 text-destructive">
              <Ban className="h-5 w-5" />
            </span>
            <div>
              <h2 className="text-lg font-bold">Blacklist {isWallet ? "Wallet" : "User"}</h2>
              <p className="truncate text-xs text-muted-foreground">{label}</p>
            </div>
          </div>
          <button onClick={onClose} className="rounded-lg p-1 text-muted-foreground hover:bg-muted" aria-label="Close">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 p-3">
          <p className="flex items-start gap-2 text-xs text-amber-800">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
            <span>
              Blacklisting blocks this {isWallet ? "wallet" : "user"} from receiving prize payouts during verification.
              The user will be notified by email and in-app with the reason below.
            </span>
          </p>
        </div>

        <div className="mt-4">
          <label className="text-xs font-medium text-muted-foreground">Reason for blacklisting *</label>
          <textarea
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            rows={4}
            autoFocus
            placeholder="Describe the reason the user will see…"
            className="mt-1 w-full rounded-lg border border-input bg-background px-3 py-2 text-sm outline-none focus:border-primary focus:ring-1 focus:ring-primary"
          />
        </div>

        <div className="mt-3 flex items-start gap-2 rounded-lg bg-muted/50 p-3 text-[11px] text-muted-foreground">
          <LifeBuoy className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
          <span>
            The user will be told they can contact Customer Care at{" "}
            <a href={`mailto:${SUPPORT_EMAIL}`} className="font-semibold text-primary underline">{SUPPORT_EMAIL}</a>{" "}
            for help with their status.
          </span>
        </div>

        <div className="mt-5 flex gap-3">
          <button
            onClick={onClose}
            disabled={busy}
            className="flex-1 rounded-lg border border-border py-2.5 text-sm font-semibold hover:bg-muted disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            onClick={submit}
            disabled={busy || !reason.trim()}
            className="flex-1 rounded-lg bg-destructive py-2.5 text-sm font-semibold text-destructive-foreground hover:bg-destructive/90 disabled:opacity-50"
          >
            {busy ? "Blacklisting…" : "Blacklist & Notify"}
          </button>
        </div>
      </div>
    </div>
  );
}