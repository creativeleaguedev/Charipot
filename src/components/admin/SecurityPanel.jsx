import React, { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { useToast } from "@/components/ui/use-toast";
import { cn } from "@/lib/utils";
import { Ban, ShieldCheck } from "lucide-react";
import BlacklistModal from "@/components/admin/BlacklistModal";

// Blacklist users and wallets. Blacklisted winners are automatically blocked
// from receiving prize payouts during admin verification (see verifyPayout).
export default function SecurityPanel({ user }) {
  const [users, setUsers] = useState([]);
  const [wallets, setWallets] = useState([]);
  const [busy, setBusy] = useState(null);
  const [blTarget, setBlTarget] = useState(null);
  const [blType, setBlType] = useState("user");
  const { toast } = useToast();

  const load = async () => {
    // Privileged fetch so both admin and platform_admin see every record.
    const res = await base44.functions.invoke("getAdminUsers", {});
    setUsers(res?.data?.users || []);
    setWallets(res?.data?.wallets || []);
  };
  useEffect(() => { load(); }, []);

  const confirmBlacklist = async (reason) => {
    const t = blTarget;
    if (!t) return;
    try {
      await base44.functions.invoke("adminSetBlacklist", {
        targetType: blType, targetId: t.id, blacklisted: true, reason,
      });
      toast({ title: blType === "user" ? "User blacklisted" : "Wallet blacklisted", description: blType === "user" ? `${t.email} — ${reason}` : (t.fullName || t.walletAddress), variant: "destructive" });
    } catch (e) {
      toast({ title: "Failed", description: e.message, variant: "destructive" });
    } finally {
      load();
    }
  };

  const unblacklistUser = async (u) => {
    setBusy(u.id);
    try {
      await base44.functions.invoke("adminSetBlacklist", { targetType: "user", targetId: u.id, blacklisted: false });
      toast({ title: "User unblacklisted", description: u.email });
      load();
    } catch (e) {
      toast({ title: "Failed", description: e.message, variant: "destructive" });
    } finally {
      setBusy(null);
    }
  };

  const unblacklistWallet = async (w) => {
    setBusy(w.id);
    try {
      await base44.functions.invoke("adminSetBlacklist", { targetType: "wallet", targetId: w.id, blacklisted: false });
      toast({ title: "Wallet unblacklisted", description: w.fullName || w.walletAddress });
      load();
    } catch (e) {
      toast({ title: "Failed", description: e.message, variant: "destructive" });
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="space-y-5">
      <p className="text-sm text-muted-foreground">Blacklist users and wallets. Blacklisted winners are blocked from receiving prize payouts during verification. The affected user is notified with the reason and a Customer Care contact.</p>

      <div className="rounded-2xl border border-border bg-card p-6 shadow-sm">
        <h2 className="flex items-center gap-2 text-lg font-bold"><Ban className="h-5 w-5 text-destructive" /> Users</h2>
        <div className="mt-4 space-y-2">
          {users.length === 0 && <p className="text-sm text-muted-foreground">No users.</p>}
          {users.map((u) => (
            <div key={u.id} className={cn("flex flex-wrap items-center justify-between gap-3 rounded-xl border p-3", u.isBlacklisted ? "border-red-200 bg-red-50/50" : "border-border")}>
              <div>
                <p className="text-sm font-semibold">{u.full_name || u.email} <span className="text-xs font-normal text-muted-foreground">· {u.email}</span></p>
                <p className="text-[11px] text-muted-foreground">Role: {u.role}</p>
                {u.isBlacklisted && <p className="mt-0.5 text-[11px] font-semibold text-destructive">Blacklisted: {u.blacklistReason}</p>}
              </div>
              <button
                onClick={() => (u.isBlacklisted ? unblacklistUser(u) : (setBlType("user"), setBlTarget(u)))}
                disabled={busy === u.id}
                className={cn("inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold disabled:opacity-50", u.isBlacklisted ? "border border-border bg-card hover:bg-muted" : "bg-destructive text-destructive-foreground hover:bg-destructive/90")}
              >
                {u.isBlacklisted ? <><ShieldCheck className="h-4 w-4" /> Unblacklist</> : <><Ban className="h-4 w-4" /> Blacklist</>}
              </button>
            </div>
          ))}
        </div>
      </div>

      <div className="rounded-2xl border border-border bg-card p-6 shadow-sm">
        <h2 className="flex items-center gap-2 text-lg font-bold"><Ban className="h-5 w-5 text-destructive" /> Wallets</h2>
        <div className="mt-4 space-y-2">
          {wallets.length === 0 && <p className="text-sm text-muted-foreground">No wallets.</p>}
          {wallets.map((w) => (
            <div key={w.id} className={cn("flex flex-wrap items-center justify-between gap-3 rounded-xl border p-3", w.isBlacklisted ? "border-red-200 bg-red-50/50" : "border-border")}>
              <div>
                <p className="text-sm font-semibold">{w.fullName || "Unnamed wallet"}</p>
                <p className="text-[11px] text-muted-foreground">{w.walletAddress || "no address"} · GOV {w.govBalance || 0} · Prize {w.prizeBalance || 0}</p>
                {w.isBlacklisted && <p className="mt-0.5 text-[11px] font-semibold text-destructive">Blacklisted: {w.blacklistReason}</p>}
              </div>
              <button
                onClick={() => (w.isBlacklisted ? unblacklistWallet(w) : (setBlType("wallet"), setBlTarget(w)))}
                disabled={busy === w.id}
                className={cn("inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold disabled:opacity-50", w.isBlacklisted ? "border border-border bg-card hover:bg-muted" : "bg-destructive text-destructive-foreground hover:bg-destructive/90")}
              >
                {w.isBlacklisted ? <><ShieldCheck className="h-4 w-4" /> Unblacklist</> : <><Ban className="h-4 w-4" /> Blacklist</>}
              </button>
            </div>
          ))}
        </div>
      </div>

      <BlacklistModal
        open={!!blTarget}
        target={blTarget}
        targetType={blType}
        onClose={() => setBlTarget(null)}
        onDone={confirmBlacklist}
      />
    </div>
  );
}