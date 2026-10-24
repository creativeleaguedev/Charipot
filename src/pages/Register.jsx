import React, { useState } from "react";
import { Link } from "react-router-dom";
import { base44 } from "@/api/base44Client";
import AuthLayout from "@/components/AuthLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Mail, Lock, Loader2, UserPlus, ArrowRight } from "lucide-react";
import { InputOTP, InputOTPGroup, InputOTPSlot } from "@/components/ui/input-otp";
import GoogleIcon from "@/components/GoogleIcon";
import { toast } from "@/components/ui/use-toast";
import { safeReturnTo } from "@/lib/authReturnTo";

export default function Register() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [showOtp, setShowOtp] = useState(false);
  const [otpCode, setOtpCode] = useState("");
  const returnTo = safeReturnTo();

  const handleRegister = async (e) => {
    e.preventDefault();
    setError("");
    if (password !== confirmPassword) { setError("Passwords do not match"); return; }
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

  return (
    <AuthLayout
      icon={UserPlus}
      title={showOtp ? "Verify your email" : "Create your account"}
      subtitle={showOtp ? "Enter the code we sent you" : "Join Charipot Charity Program and start funding impact"}
      footer={<>Already have an account? <Link to="/login" className="text-primary font-medium hover:underline">Log in</Link></>}
    >
      {showOtp ? (
        <div className="space-y-4">
          <p className="text-center text-sm text-muted-foreground">We sent a code to <span className="font-medium text-foreground">{email}</span></p>
          {error && <div className="rounded-lg bg-destructive/10 p-2.5 text-sm text-destructive">{error}</div>}
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
        <>
          <form onSubmit={handleRegister} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <div className="relative">
                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <Input id="email" type="email" autoComplete="email" autoFocus placeholder="you@example.com" value={email} onChange={(e) => setEmail(e.target.value)} className="pl-10 h-11" glow={false} borderRadius="0.5rem" required />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="password">Password</Label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <Input id="password" type="password" autoComplete="new-password" placeholder="••••••••" value={password} onChange={(e) => setPassword(e.target.value)} className="pl-10 h-11" glow={false} borderRadius="0.5rem" required />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="confirm">Confirm Password</Label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <Input id="confirm" type="password" autoComplete="new-password" placeholder="••••••••" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} className="pl-10 h-11" glow={false} borderRadius="0.5rem" required />
              </div>
            </div>
            {error && <div className="rounded-lg bg-destructive/10 p-2.5 text-sm text-destructive">{error}</div>}
            <Button type="submit" className="w-full h-11 font-medium" disabled={loading}>
              {loading ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Creating account...</> : <>Create account <ArrowRight className="w-4 h-4 ml-1" /></>}
            </Button>
          </form>
          <div className="relative my-4">
            <div className="absolute inset-0 flex items-center"><div className="w-full border-t border-border" /></div>
            <div className="relative flex justify-center text-xs uppercase"><span className="bg-card px-3 text-muted-foreground">or</span></div>
          </div>
          <Button variant="outline" className="w-full h-11 text-sm font-medium" onClick={handleGoogle}>
            <GoogleIcon className="w-5 h-5 mr-2" /> Continue with Google
          </Button>
        </>
      )}
    </AuthLayout>
  );
}