import React, { useState, useRef, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { base44 } from "@/api/base44Client";
import { cn } from "@/lib/utils";
import { ShieldCheck, Mail, KeyRound, Loader2, AlertTriangle, RefreshCw, ArrowLeft, X } from "lucide-react";
import { useToast } from "@/components/ui/use-toast";
import BrandLogo from "@/components/ui/BrandLogo";

// Two-step gate shown before the Admin Command Center unlocks:
//   1. Admin enters their email — if it isn't one of the authorized admin
//      accounts, Access Denied. Otherwise a 6-digit code is emailed.
//   2. Admin enters the code — on match the Command Center opens for the
//      session (sessionStorage), so reopening the tab in the same session
//      stays unlocked until the browser is closed.
function extractErr(e, fallback) {
  return e?.response?.data?.message || e?.message || fallback;
}

export default function AdminAccessGate({ userEmail, onUnlocked }) {
  const navigate = useNavigate();
  const [step, setStep] = useState("email"); // email | code | denied
  const [email, setEmail] = useState(userEmail || "");
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [resendIn, setResendIn] = useState(0);
  const codeRef = useRef(null);
  const { toast } = useToast();

  // Resend countdown.
  useEffect(() => {
    if (resendIn <= 0) return;
    const t = setTimeout(() => setResendIn((s) => s - 1), 1000);
    return () => clearTimeout(t);
  }, [resendIn]);

  // Autofocus the code field when we move to it.
  useEffect(() => {
    if (step === "code" && codeRef.current) codeRef.current.focus();
  }, [step]);

  const requestCode = async () => {
    setError("");
    if (!email.trim()) { setError("Enter your admin email."); return; }
    setBusy(true);
    try {
      const res = await base44.functions.invoke("adminAccessGate", { mode: "request", email: email.trim() });
      if (res?.data?.denied) { setStep("denied"); return; }
      if (!res?.data?.ok) { setError(res?.data?.message || "Could not send code."); return; }
      setStep("code");
      setResendIn(30);
      toast({ title: "Access code sent", description: `Check ${email.trim()} for your 6-digit code.` });
    } catch (e) {
      if (e?.response?.status === 403 && e?.response?.data?.denied) { setStep("denied"); return; }
      setError(extractErr(e, "Could not send code."));
    } finally {
      setBusy(false);
    }
  };

  const verifyCode = async () => {
    setError("");
    if (code.length < 6) { setError("Enter the 6-digit code."); return; }
    setBusy(true);
    try {
      const res = await base44.functions.invoke("adminAccessGate", { mode: "verify", email: email.trim(), code });
      if (res?.data?.granted) {
        sessionStorage.setItem("adminGateUnlocked", "1");
        onUnlocked();
        return;
      }
      setError(res?.data?.message || "Incorrect code.");
    } catch (e) {
      setError(extractErr(e, "Verification failed."));
    } finally {
      setBusy(false);
    }
  };

  const resend = async () => {
    setCode("");
    setError("");
    await requestCode();
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{
        backgroundImage:
          "linear-gradient(rgba(10,18,40,0.80), rgba(10,18,40,0.88)), url('https://media.base44.com/images/public/6a9fd1112d3233a0a31bca58/97d967e58_image.png')",
        backgroundSize: "cover",
        backgroundPosition: "center",
      }}
    >
      <div className="w-full max-w-md">
        <div className="relative rounded-3xl border border-white/10 bg-slate-900/85 p-8 shadow-2xl backdrop-blur-xl">
          {/* Back / dismiss button */}
          <button
            type="button"
            onClick={() => navigate(-1)}
            title="Go back"
            className="absolute left-4 top-4 inline-flex h-9 w-9 items-center justify-center rounded-full border border-white/15 bg-white/5 text-slate-300 transition hover:bg-white/10 hover:text-white"
          >
            <ArrowLeft className="h-4 w-4" />
          </button>
          <button
            type="button"
            onClick={() => navigate(-1)}
            title="Close"
            className="absolute right-4 top-4 inline-flex h-9 w-9 items-center justify-center rounded-full border border-white/15 bg-white/5 text-slate-300 transition hover:bg-white/10 hover:text-white"
          >
            <X className="h-4 w-4" />
          </button>

          {/* Header */}
          <div className="flex flex-col items-center text-center">
            <span className="flex h-14 w-14 items-center justify-center rounded-full bg-white/5 shadow-lg ring-1 ring-white/10">
              <BrandLogo height={48} />
            </span>
            <h1 className="mt-4 text-xl font-bold text-white">Restricted Access</h1>
            <p className="mt-1 text-sm text-slate-400">Administrator Command Center</p>
          </div>

          {/* Step 1 — email */}
          {step === "email" && (
            <div className="mt-7 space-y-4">
              <div>
                <label className="text-xs font-semibold uppercase tracking-wider text-slate-400">Admin email</label>
                <div className="group relative mt-2">
                  <Mail className="pointer-events-none absolute left-3.5 top-1/2 h-4.5 w-4.5 -translate-y-1/2 text-cyan-300/70" />
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && requestCode()}
                    placeholder="you@rotaryimpact.org"
                    autoFocus
                    className="w-full rounded-xl border border-cyan-400/30 bg-slate-950/70 py-3.5 pl-11 pr-4 text-white placeholder-slate-600 outline-none transition-all duration-300 focus:border-cyan-300 focus:shadow-[0_0_0_2px_rgba(34,211,238,0.35),0_0_28px_rgba(34,211,238,0.55)]"
                  />
                </div>
              </div>
              {error && <p className="flex items-center gap-1.5 text-sm text-red-400"><AlertTriangle className="h-4 w-4" /> {error}</p>}
              <button
                onClick={requestCode}
                disabled={busy}
                className="w-full rounded-xl bg-gold-gradient py-3.5 text-sm font-bold text-slate-900 shadow-lg transition hover:opacity-90 disabled:opacity-50"
              >
                {busy ? <Loader2 className="mx-auto h-5 w-5 animate-spin" /> : "Send Access Code"}
              </button>
            </div>
          )}

          {/* Step 2 — code */}
          {step === "code" && (
            <div className="mt-7 space-y-4">
              <div className="rounded-xl border border-cyan-400/20 bg-cyan-500/5 px-4 py-3 text-center">
                <p className="text-xs text-slate-400">Code sent to</p>
                <p className="text-sm font-semibold text-cyan-300">{email}</p>
              </div>
              <div>
                <label className="text-xs font-semibold uppercase tracking-wider text-slate-400">6-digit code</label>
                <div className="group relative mt-2">
                  <KeyRound className="pointer-events-none absolute left-3.5 top-1/2 h-4.5 w-4.5 -translate-y-1/2 text-cyan-300/70" />
                  <input
                    ref={codeRef}
                    type="text"
                    inputMode="numeric"
                    maxLength={6}
                    value={code}
                    onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
                    onKeyDown={(e) => e.key === "Enter" && verifyCode()}
                    placeholder="••••••"
                    className="w-full rounded-xl border border-cyan-400/30 bg-slate-950/70 py-3.5 pl-11 pr-4 text-center text-2xl font-bold tracking-[0.5em] text-white placeholder-slate-700 outline-none transition-all duration-300 focus:border-cyan-300 focus:shadow-[0_0_0_2px_rgba(34,211,238,0.35),0_0_28px_rgba(34,211,238,0.55)]"
                  />
                </div>
              </div>
              {error && <p className="flex items-center gap-1.5 text-sm text-red-400"><AlertTriangle className="h-4 w-4" /> {error}</p>}
              <button
                onClick={verifyCode}
                disabled={busy || code.length < 6}
                className="w-full rounded-xl bg-gold-gradient py-3.5 text-sm font-bold text-slate-900 shadow-lg transition hover:opacity-90 disabled:opacity-50"
              >
                {busy ? <Loader2 className="mx-auto h-5 w-5 animate-spin" /> : "Unlock Command Center"}
              </button>
              <div className="flex items-center justify-between text-xs">
                <button onClick={() => { setStep("email"); setCode(""); setError(""); }} className="inline-flex items-center gap-1 text-slate-400 hover:text-slate-200">
                  <ArrowLeft className="h-3.5 w-3.5" /> Change email
                </button>
                <button
                  onClick={resend}
                  disabled={resendIn > 0 || busy}
                  className="inline-flex items-center gap-1 text-cyan-300 hover:text-cyan-200 disabled:opacity-50"
                >
                  <RefreshCw className="h-3.5 w-3.5" /> {resendIn > 0 ? `Resend in ${resendIn}s` : "Resend code"}
                </button>
              </div>
            </div>
          )}

          {/* Access denied */}
          {step === "denied" && (
            <div className="mt-7 flex flex-col items-center text-center">
              <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-red-500/15">
                <AlertTriangle className="h-7 w-7 text-red-400" />
              </span>
              <h2 className="mt-4 text-xl font-bold text-white">Access Denied</h2>
              <button
                onClick={() => { setStep("email"); setError(""); }}
                className="mt-6 inline-flex items-center gap-1.5 rounded-xl border border-white/15 px-4 py-2.5 text-sm font-semibold text-slate-200 hover:bg-white/5"
              >
                <ArrowLeft className="h-4 w-4" /> Try again
              </button>
            </div>
          )}
        </div>
        <p className="mt-4 text-center text-[11px] text-slate-500">Charity Program · Admin Verification</p>
      </div>
    </div>
  );
}