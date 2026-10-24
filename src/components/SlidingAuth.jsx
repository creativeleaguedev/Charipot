import React, { useState } from "react";
import { Link } from "react-router-dom";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Mail, Lock, Loader2, LogIn, UserPlus, ArrowRight, Heart, ShieldCheck, Vote } from "lucide-react";
import { InputOTP, InputOTPGroup, InputOTPSlot } from "@/components/ui/input-otp";
import GoogleIcon from "@/components/GoogleIcon";
import { toast } from "@/components/ui/use-toast";
import { safeReturnTo } from "@/lib/authReturnTo";
import { useIsMobile } from "@/hooks/use-mobile";
import BrandLogo from "@/components/ui/BrandLogo";
import { cn } from "@/lib/utils";

// Combined Login + Register experience with a sliding overlay panel (the
// classic "sign in / sign up" slide). Both modes share one component so the
// overlay animates between them; the active route (/login or /register) only
// sets the starting mode. All auth flows are preserved: email/password login,
// Google, register -> OTP -> verify -> wallet provisioning, resend, forgot.
export default function SlidingAuth({ initialMode = "login" }) {
  const [mode, setMode] = useState(initialMode); // "login" | "register"
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [showOtp, setShowOtp] = useState(false);
  const [otpCode, setOtpCode] = useState("");
  const isMobile = useIsMobile();

  const returnTo = safeReturnTo();

  const handleLogin = async (e) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      await base44.auth.loginViaEmailPassword(email, password);
      window.location.href = returnTo;
    } catch (err) {
      setError(err.message || "Invalid email or password");
    } finally {
      setLoading(false);
    }
  };

  const handleRegister = async (e) => {
    e.preventDefault();
    setError("");
    if (password !== confirmPassword) {
      setError("Passwords do not match");
      return;
    }
    setLoading(true);
    try {
      await base44.auth.register({ email, password });
      setShowOtp(true);
    } catch (err) {
      setError(err.message || "Registration failed");
    } finally {
      setLoading(false);
    }
  };

  const handleVerify = async () => {
    setError("");
    setLoading(true);
    try {
      const result = await base44.auth.verifyOtp({ email, otpCode });
      if (result?.access_token) {
        base44.auth.setToken(result.access_token);
        try { await base44.functions.invoke("createWallet", {}); } catch (_) {}
      }
      window.location.href = safeReturnTo();
    } catch (err) {
      setError(err.message || "Invalid verification code");
    } finally {
      setLoading(false);
    }
  };

  const handleResend = async () => {
    setError("");
    try {
      await base44.auth.resendOtp(email);
      toast({ title: "Code sent", description: "Check your email for the new code." });
    } catch (err) {
      setError(err.message || "Failed to resend code");
    }
  };

  const handleGoogle = () => base44.auth.loginWithProvider("google", returnTo);

  const isReg = mode === "register";

  // ---- Shared brand overlay copy (Rotary & Charity) ----
  const Overlay = () => (
    <div className="relative h-full w-full bg-navy-gradient text-white">
      <div className="pointer-events-none absolute inset-0 opacity-20"
        style={{ backgroundImage: "radial-gradient(circle at 20% 20%, hsl(43 80% 55%) 0, transparent 40%), radial-gradient(circle at 80% 80%, hsl(200 80% 55%) 0, transparent 40%)" }} />
      <div className="relative flex h-full w-full flex-col items-center justify-center px-8 text-center">
        <BrandLogo height={48} className="rounded-xl bg-white/95 p-1" />
        <p className="mt-4 text-xl font-bold">Rotary &amp; Charity</p>
        <p className="text-xs font-medium uppercase tracking-[0.25em] text-amber-300">Service Above Self</p>
        <div className="mt-6 space-y-3 text-sm text-white/80">
          <p className="flex items-center justify-center gap-2"><Heart className="h-4 w-4 text-amber-300" /> Every ticket funds real impact</p>
          <p className="flex items-center justify-center gap-2"><Vote className="h-4 w-4 text-amber-300" /> Vote on projects with GOV tokens</p>
          <p className="flex items-center justify-center gap-2"><ShieldCheck className="h-4 w-4 text-amber-300" /> Transparent, on-chain giving</p>
        </div>
      </div>
    </div>
  );

  // ---- Login form ----
  const LoginForm = (
    <form onSubmit={handleLogin} className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="email">Email</Label>
        <div className="relative">
          <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input id="email" type="email" autoComplete="email" autoFocus placeholder="you@example.com" value={email} onChange={(e) => setEmail(e.target.value)} className="pl-10 h-11" required />
        </div>
      </div>
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <Label htmlFor="password">Password</Label>
          <Link to="/forgot-password" className="text-xs text-primary hover:underline">Forgot?</Link>
        </div>
        <div className="relative">
          <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input id="password" type="password" autoComplete="current-password" placeholder="••••••••" value={password} onChange={(e) => setPassword(e.target.value)} className="pl-10 h-11" required />
        </div>
      </div>
      {error && !isReg && <div className="rounded-lg bg-destructive/10 p-2.5 text-sm text-destructive">{error}</div>}
      <Button type="submit" className="w-full h-11 font-medium" disabled={loading}>
        {loading ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Logging in...</> : <>Log in <ArrowRight className="w-4 h-4 ml-1" /></>}
      </Button>
    </form>
  );

  // ---- Register form (or OTP step) ----
  const RegisterForm = showOtp ? (
    <div className="space-y-4">
      <p className="text-center text-sm text-muted-foreground">We sent a code to <span className="font-medium text-foreground">{email}</span></p>
      {error && isReg && <div className="rounded-lg bg-destructive/10 p-2.5 text-sm text-destructive">{error}</div>}
      <div className="flex justify-center">
        <InputOTP maxLength={6} value={otpCode} onChange={setOtpCode} autoFocus autoComplete="one-time-code">
          <InputOTPGroup>
            <InputOTPSlot index={0} /><InputOTPSlot index={1} /><InputOTPSlot index={2} />
            <InputOTPSlot index={3} /><InputOTPSlot index={4} /><InputOTPSlot index={5} />
          </InputOTPGroup>
        </InputOTP>
      </div>
      <Button className="w-full h-11 font-medium" onClick={handleVerify} disabled={loading || otpCode.length < 6}>
        {loading ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Verifying...</> : "Verify"}
      </Button>
      <p className="text-center text-sm text-muted-foreground">
        Didn't receive the code? <button onClick={handleResend} className="font-medium text-primary hover:underline">Resend</button>
      </p>
    </div>
  ) : (
    <form onSubmit={handleRegister} className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="r-email">Email</Label>
        <div className="relative">
          <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input id="r-email" type="email" autoComplete="email" autoFocus placeholder="you@example.com" value={email} onChange={(e) => setEmail(e.target.value)} className="pl-10 h-11" required />
        </div>
      </div>
      <div className="space-y-2">
        <Label htmlFor="r-password">Password</Label>
        <div className="relative">
          <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input id="r-password" type="password" autoComplete="new-password" placeholder="••••••••" value={password} onChange={(e) => setPassword(e.target.value)} className="pl-10 h-11" required />
        </div>
      </div>
      <div className="space-y-2">
        <Label htmlFor="r-confirm">Confirm Password</Label>
        <div className="relative">
          <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input id="r-confirm" type="password" autoComplete="new-password" placeholder="••••••••" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} className="pl-10 h-11" required />
        </div>
      </div>
      {error && isReg && <div className="rounded-lg bg-destructive/10 p-2.5 text-sm text-destructive">{error}</div>}
      <Button type="submit" className="w-full h-11 font-medium" disabled={loading}>
        {loading ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Creating account...</> : <>Create account <ArrowRight className="w-4 h-4 ml-1" /></>}
      </Button>
    </form>
  );

  const GoogleButton = (
    <Button variant="outline" className="w-full h-11 text-sm font-medium" onClick={handleGoogle}>
      <GoogleIcon className="w-5 h-5 mr-2" /> Continue with Google
    </Button>
  );

  const Divider = (
    <div className="relative my-4">
      <div className="absolute inset-0 flex items-center"><div className="w-full border-t border-border" /></div>
      <div className="relative flex justify-center text-xs uppercase"><span className="bg-card px-3 text-muted-foreground">or</span></div>
    </div>
  );

  // ---- Mobile: stacked single card ----
  if (isMobile) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-navy-gradient px-4 py-8">
        <div className="mb-5 flex flex-col items-center text-center text-white">
          <BrandLogo height={44} className="rounded-xl bg-white/95 p-1" />
          <p className="mt-3 text-lg font-bold">Rotary &amp; Charity</p>
          <p className="text-[10px] uppercase tracking-[0.25em] text-amber-300">Service Above Self</p>
        </div>
        <div className="w-full max-w-md rounded-2xl bg-card p-6 shadow-2xl">
          <div className="mb-4 flex gap-1 rounded-full bg-muted p-1">
            <button onClick={() => { setMode("login"); setError(""); }} className={cn("flex-1 rounded-full py-2 text-sm font-medium transition-colors", !isReg ? "bg-primary text-primary-foreground" : "text-muted-foreground")}>Log in</button>
            <button onClick={() => { setMode("register"); setError(""); }} className={cn("flex-1 rounded-full py-2 text-sm font-medium transition-colors", isReg ? "bg-primary text-primary-foreground" : "text-muted-foreground")}>Sign up</button>
          </div>
          {GoogleButton}
          {Divider}
          {isReg ? RegisterForm : LoginForm}
        </div>
      </div>
    );
  }

  // ---- Desktop: sliding two-panel card ----
  const t = "transform 0.7s cubic-bezier(0.65, 0, 0.35, 1)";
  return (
    <div className="min-h-screen flex items-center justify-center bg-navy-gradient px-4 py-8">
      <div className="relative w-full max-w-[820px] min-h-[540px] overflow-hidden rounded-2xl bg-card shadow-2xl">
        {/* Login form (left half) */}
        <div style={{ position: "absolute", top: 0, left: 0, width: "50%", height: "100%", transition: t, transform: isReg ? "translateX(100%)" : "translateX(0%)", opacity: isReg && !showOtp ? 0 : 1, zIndex: 2 }} className="flex flex-col justify-center px-10">
          <h1 className="flex items-center gap-2 text-2xl font-bold tracking-tight"><LogIn className="h-6 w-6 text-primary" /> Welcome back</h1>
          <p className="mt-1 text-sm text-muted-foreground">Log in to your account</p>
          <div className="mt-5">{GoogleButton}{Divider}{LoginForm}</div>
        </div>

        {/* Register form (left half, slides in) */}
        <div style={{ position: "absolute", top: 0, left: 0, width: "50%", height: "100%", transition: t, transform: isReg ? "translateX(100%)" : "translateX(0%)", opacity: isReg ? 1 : 0, zIndex: isReg ? 3 : 1 }} className="flex flex-col justify-center px-10">
          <h1 className="flex items-center gap-2 text-2xl font-bold tracking-tight"><UserPlus className="h-6 w-6 text-primary" /> {showOtp ? "Verify email" : "Create your account"}</h1>
          <p className="mt-1 text-sm text-muted-foreground">{showOtp ? "Enter the code we sent you" : "Sign up to get started"}</p>
          <div className="mt-5">{showOtp ? RegisterForm : <>{GoogleButton}{Divider}{RegisterForm}</>}</div>
        </div>

        {/* Overlay container (right half) */}
        <div style={{ position: "absolute", top: 0, left: "50%", width: "50%", height: "100%", overflow: "hidden", transition: t, transform: isReg ? "translateX(-100%)" : "translateX(0%)", zIndex: 4 }}>
          <div style={{ position: "relative", left: "-100%", width: "200%", height: "100%", transition: t, transform: isReg ? "translateX(50%)" : "translateX(0%)" }} className="h-full">
            {/* overlay-left (shown in register mode) */}
            <div style={{ position: "absolute", top: 0, left: 0, width: "50%", height: "100%", transition: t, transform: isReg ? "translateX(0)" : "translateX(-20%)", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: "0 40px", textAlign: "center" }}>
              <Overlay />
              <div className="absolute inset-0 flex flex-col items-center justify-center px-10 text-center text-white">
                <h2 className="text-2xl font-bold">Welcome back!</h2>
                <p className="mt-2 text-sm text-white/80">Already part of the community? Sign in to keep funding impact.</p>
                <button onClick={() => { setMode("login"); setError(""); }} className="mt-5 rounded-full border-2 border-white px-8 py-2 text-sm font-semibold transition-colors hover:bg-white hover:text-primary">
                  Log in
                </button>
              </div>
            </div>
            {/* overlay-right (shown in login mode) */}
            <div style={{ position: "absolute", top: 0, right: 0, width: "50%", height: "100%", transition: t, transform: isReg ? "translateX(20%)" : "translateX(0)", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: "0 40px", textAlign: "center" }}>
              <Overlay />
              <div className="absolute inset-0 flex flex-col items-center justify-center px-10 text-center text-white">
                <h2 className="text-2xl font-bold">New here?</h2>
                <p className="mt-2 text-sm text-white/80">Create an account and start funding real-world charity today.</p>
                <button onClick={() => { setMode("register"); setError(""); }} className="mt-5 rounded-full border-2 border-white px-8 py-2 text-sm font-semibold transition-colors hover:bg-white hover:text-primary">
                  Sign up
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}