import { useState, useRef, useEffect, useCallback } from "react";
import { useLocation } from "wouter";
import { useAuth, type AuthUser } from "@/hooks/use-auth";
import { startAuthentication } from "@simplewebauthn/browser";
import BiometricSetupModal from "@/components/BiometricSetupModal";

type Step = "phone" | "credentials";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

async function apiPost(path: string, body: unknown) {
  const res = await fetch(`${BASE}/api${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error ?? "Request failed");
  return data;
}

type BiometricAutoState = "idle" | "waiting" | "scanning" | "failed";
const BIOMETRIC_KEY = "orbittrack_biometric";

function isBiometricSupported() {
  return typeof window !== "undefined" && !!window.PublicKeyCredential;
}

interface FoundUser {
  name: string;
  role: string;
  requiresSchoolCode: boolean;
  demoCode: string;
}

const ROLE_LABELS: Record<string, string> = {
  superadmin: "Super Admin",
  admin: "School Admin",
  driver: "Driver",
  staff: "Staff",
  student: "Student / Parent",
  parent: "Parent",
};

export default function AuthScreen() {
  const { login } = useAuth();
  const [, navigate] = useLocation();

  const [pendingUser, setPendingUser] = useState<AuthUser | null>(null);
  const [bioAutoState, setBioAutoState] = useState<BiometricAutoState>("idle");
  const [bioCredentialId, setBioCredentialId] = useState<string | null>(null);

  const [step, setStep] = useState<Step>("phone");
  const [phone, setPhone] = useState("");
  const [otp, setOtp] = useState(["", "", "", "", "", ""]);
  const [schoolCode, setSchoolCode] = useState("");
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState("");
  const [foundUser, setFoundUser] = useState<FoundUser | null>(null);

  const otpRefs = useRef<(HTMLInputElement | null)[]>([]);

  // ── Biometric auto-login ──────────────────────────────────────────────
  const triggerBiometricLogin = useCallback(async (credentialId: string) => {
    setBioAutoState("scanning");
    try {
      const options = await apiPost("/auth/webauthn/login-options", { credentialId });
      const response = await startAuthentication({ optionsJSON: options });
      const result = await apiPost("/auth/webauthn/login-verify", { response });
      if (result.verified && result.user) {
        login({ ...result.user, tenant: result.user.tenant ?? null });
        navigate("/dashboard");
      } else {
        setBioAutoState("failed");
      }
    } catch {
      setBioAutoState("failed");
    }
  }, [login, navigate]);

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      const stored = localStorage.getItem(BIOMETRIC_KEY);
      if (stored && isBiometricSupported()) {
        const { credentialId } = JSON.parse(stored) as { phone: string; credentialId: string };
        if (credentialId) {
          setBioCredentialId(credentialId);
          setBioAutoState("waiting");
          timer = setTimeout(() => triggerBiometricLogin(credentialId), 350);
        }
      }
    } catch { /* ignore parse errors */ }
    return () => { if (timer !== undefined) clearTimeout(timer); };
  }, [triggerBiometricLogin]);

  useEffect(() => {
    if (foundUser?.demoCode && step === "credentials") {
      setOtp(foundUser.demoCode.split(""));
      otpRefs.current[0]?.focus();
    }
  }, [foundUser, step]);

  // ── Auth handlers ─────────────────────────────────────────────────────
  function finishAuth(user: AuthUser) {
    login(user);
    if (!user.biometricEnabled && isBiometricSupported()) {
      setPendingUser(user);
    } else {
      navigate("/dashboard");
    }
  }

  async function handleCheckPhone() {
    setErr(""); setLoading(true);
    try {
      const data = await apiPost("/auth/check-phone", { phone }) as FoundUser;
      setFoundUser(data);
      setSchoolCode("");
      setOtp(["", "", "", "", "", ""]);
      setStep("credentials");
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : "Could not verify number");
    } finally { setLoading(false); }
  }

  async function handleVerifyOtp() {
    setErr(""); setLoading(true);
    const code = otp.join("");
    if (foundUser?.requiresSchoolCode && !schoolCode.trim()) {
      setErr("Please enter your school code"); setLoading(false); return;
    }
    try {
      const data = await apiPost("/auth/verify-otp", {
        phone,
        code,
        ...(foundUser?.requiresSchoolCode ? { schoolCode: schoolCode.trim() } : {}),
      });
      if (data.user) {
        finishAuth({ ...data.user, tenant: data.user.tenant ?? null });
      } else {
        setErr("Login failed. Please try again.");
      }
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : "Invalid credentials");
    } finally { setLoading(false); }
  }

  function handleOtpKey(idx: number, value: string) {
    const next = [...otp];
    next[idx] = value.slice(-1);
    setOtp(next);
    if (value && idx < 5) otpRefs.current[idx + 1]?.focus();
    if (!value && idx > 0) otpRefs.current[idx - 1]?.focus();
  }

  function handleOtpPaste(e: React.ClipboardEvent) {
    const text = e.clipboardData.getData("text").replace(/\D/g, "").slice(0, 6);
    if (text.length === 6) {
      setOtp(text.split(""));
      otpRefs.current[5]?.focus();
    }
  }

  function resetToPhone() {
    setStep("phone");
    setFoundUser(null);
    setOtp(["", "", "", "", "", ""]);
    setSchoolCode("");
    setErr("");
  }

  // ── Render ────────────────────────────────────────────────────────────
  return (
    <>
    {/* Biometric auto-login overlay */}
    {bioAutoState !== "idle" && (
      <div className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-[#0F172A] px-4">
        <span className="text-5xl mb-3 bus-float">🚌</span>
        <h1 className="text-2xl font-black text-white mb-8">Orbit<span className="text-[#ffd000]">Track</span></h1>
        <div className="w-full max-w-xs rounded-3xl border border-slate-700/60 bg-gradient-to-b from-slate-800 to-slate-900 p-8 text-center shadow-2xl">
          {bioAutoState === "failed" ? (
            <>
              <div className="mx-auto mb-4 flex h-20 w-20 items-center justify-center rounded-full bg-red-900/30 ring-2 ring-red-700/40">
                <span className="text-4xl">❌</span>
              </div>
              <h2 className="text-lg font-bold text-white mb-1">Biometric Failed</h2>
              <p className="text-xs text-slate-400 mb-5">Scan not recognized or cancelled.</p>
              <button onClick={() => bioCredentialId && triggerBiometricLogin(bioCredentialId)}
                className="w-full rounded-2xl bg-amber-500 py-3 font-bold text-slate-900 hover:bg-amber-400 mb-3 transition-colors">
                🔄 Try Again
              </button>
              <button onClick={() => setBioAutoState("idle")}
                className="w-full text-xs text-slate-500 hover:text-slate-300 py-2">
                Use mobile number instead →
              </button>
            </>
          ) : (
            <>
              <div className={`mx-auto mb-5 flex h-24 w-24 items-center justify-center rounded-full bg-amber-500/10 ring-2 ring-amber-500/30 ${bioAutoState === "scanning" ? "animate-pulse" : ""}`}>
                <svg viewBox="0 0 48 48" className="h-14 w-14" fill="none">
                  <circle cx="24" cy="24" r="10" stroke="#f59e0b" strokeWidth="2.5"/>
                  <path d="M24 8C15.163 8 8 15.163 8 24" stroke="#f59e0b" strokeWidth="2.5" strokeLinecap="round"/>
                  <path d="M24 8C32.837 8 40 15.163 40 24" stroke="#fbbf24" strokeWidth="2.5" strokeLinecap="round"/>
                  <path d="M12 34c2.364 4.8 7.09 8 12 8" stroke="#f59e0b" strokeWidth="2.5" strokeLinecap="round"/>
                  <path d="M36 34c-2.364 4.8-7.09 8-12 8" stroke="#fbbf24" strokeWidth="2.5" strokeLinecap="round"/>
                  <path d="M18 24c0-3.314 2.686-6 6-6s6 2.686 6 6" stroke="#fbbf24" strokeWidth="2" strokeLinecap="round"/>
                  <circle cx="24" cy="27" r="2" fill="#f59e0b"/>
                </svg>
              </div>
              {bioAutoState === "scanning" ? (
                <>
                  <h2 className="text-lg font-bold text-white mb-1">Scanning…</h2>
                  <p className="text-sm text-slate-400 animate-pulse">Follow the prompt on your device</p>
                </>
              ) : (
                <>
                  <h2 className="text-lg font-bold text-white mb-1">Biometric Login</h2>
                  <p className="text-sm text-slate-400 mb-5">Sign in instantly with your fingerprint or Face ID</p>
                  <button onClick={() => bioCredentialId && triggerBiometricLogin(bioCredentialId)}
                    className="w-full rounded-2xl bg-gradient-to-r from-amber-500 to-amber-400 py-3.5 font-bold text-slate-900 shadow-lg hover:from-amber-400 hover:to-amber-300 transition-all mb-3 active:scale-[0.98]">
                    🔒 Sign in with Biometric
                  </button>
                  <button onClick={() => setBioAutoState("idle")}
                    className="w-full text-xs text-slate-500 hover:text-slate-300 py-2">
                    Use mobile number instead →
                  </button>
                </>
              )}
            </>
          )}
        </div>
      </div>
    )}

    {/* Post-auth biometric setup modal */}
    {pendingUser && (
      <BiometricSetupModal
        user={pendingUser}
        onComplete={() => { setPendingUser(null); navigate("/dashboard"); }}
      />
    )}

    <div className="flex min-h-[100dvh] flex-col items-center justify-center bg-[#0F172A] px-4 py-8">
      <div className="w-full max-w-sm rounded-2xl bg-slate-800 border border-slate-700 p-6 shadow-2xl">

        {/* Header */}
        <div className="mb-6 flex flex-col items-center gap-2">
          <span className="text-5xl bus-float">🚌</span>
          <h1 className="text-2xl font-black text-white">
            Orbit<span className="text-[#ffd000]">Track</span>
          </h1>
        </div>

        {/* ── STEP: Phone ── */}
        {step === "phone" && (
          <>
            <div className="mb-5 text-center">
              <h2 className="text-lg font-bold text-slate-100">Secure Login</h2>
              <p className="text-sm text-slate-400 mt-1">Enter your registered mobile number to continue</p>
            </div>

            <div className="mb-4">
              <label className="mb-1.5 block text-xs font-semibold text-slate-300 uppercase tracking-wide">Mobile Number</label>
              <div className="flex items-center gap-2 rounded-xl border border-slate-600 bg-slate-900 px-3 py-2.5 focus-within:border-amber-500 transition-colors">
                <span className="text-sm text-slate-400 select-none">🇳🇵 +977</span>
                <input
                  type="tel"
                  placeholder="98XXXXXXXX"
                  value={phone}
                  onChange={(e) => { setPhone(e.target.value.replace(/\D/g, "").slice(0, 10)); setErr(""); }}
                  className="flex-1 bg-transparent text-sm text-white placeholder:text-slate-600 outline-none"
                  onKeyDown={(e) => e.key === "Enter" && phone.length === 10 && handleCheckPhone()}
                />
              </div>
            </div>

            {err && (
              <div className="mb-3 flex items-start gap-2 rounded-xl border border-red-800/50 bg-red-900/20 px-3.5 py-3">
                <span className="text-red-400 mt-0.5 text-sm shrink-0">🚫</span>
                <p className="text-xs text-red-300 leading-relaxed">{err}</p>
              </div>
            )}

            <button
              onClick={handleCheckPhone}
              disabled={phone.length < 10 || loading}
              className="w-full rounded-xl bg-amber-500 py-3 font-bold text-slate-900 hover:bg-amber-400 disabled:opacity-40 transition-colors"
            >
              {loading ? (
                <span className="flex items-center justify-center gap-2">
                  <span className="h-4 w-4 rounded-full border-2 border-slate-900/30 border-t-slate-900 animate-spin"/>
                  Checking…
                </span>
              ) : "Continue →"}
            </button>

            <div className="mt-4 rounded-xl border border-slate-700 bg-slate-800/60 px-4 py-2.5">
              <p className="text-xs text-center text-slate-500">
                🔒 Access is restricted to registered users only
              </p>
            </div>
          </>
        )}

        {/* ── STEP: Credentials (School Code + OTP) ── */}
        {step === "credentials" && foundUser && (
          <>
            {/* Personalized welcome */}
            <div className="mb-5 rounded-xl border border-slate-700 bg-slate-900/60 px-4 py-3 flex items-center gap-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-amber-500/20 text-amber-400 font-black text-sm">
                {foundUser.name.charAt(0).toUpperCase()}
              </div>
              <div className="min-w-0">
                <p className="text-sm font-semibold text-white truncate">Welcome back, {foundUser.name.split(" ")[0]}! 👋</p>
                <p className="text-xs text-slate-400">{ROLE_LABELS[foundUser.role] ?? foundUser.role}</p>
              </div>
            </div>

            {/* School Code field */}
            {foundUser.requiresSchoolCode && (
              <div className="mb-4">
                <label className="mb-1.5 block text-xs font-semibold text-slate-300 uppercase tracking-wide">School Code</label>
                <div className="flex items-center gap-2 rounded-xl border border-slate-600 bg-slate-900 px-3 py-2.5 focus-within:border-amber-500 transition-colors">
                  <span className="text-slate-400 text-sm">🏫</span>
                  <input
                    type="text"
                    placeholder="e.g. APEX-ALPHA-1234"
                    value={schoolCode}
                    onChange={(e) => { setSchoolCode(e.target.value.toUpperCase()); setErr(""); }}
                    className="flex-1 bg-transparent text-sm text-white placeholder:text-slate-600 outline-none font-mono tracking-wider"
                    autoCapitalize="characters"
                  />
                </div>
                <p className="mt-1 text-xs text-slate-500">Your school code was provided by your school administrator</p>
              </div>
            )}

            {/* OTP input */}
            <div className="mb-4">
              <div className="flex items-center justify-between mb-1.5">
                <label className="text-xs font-semibold text-slate-300 uppercase tracking-wide">Verification Code</label>
                <span className="text-xs text-slate-500">Sent to +977 {phone}</span>
              </div>
              <div className="flex gap-2 justify-center" onPaste={handleOtpPaste}>
                {otp.map((digit, i) => (
                  <input
                    key={i}
                    ref={(el) => { otpRefs.current[i] = el; }}
                    type="text"
                    inputMode="numeric"
                    maxLength={1}
                    value={digit}
                    onChange={(e) => { handleOtpKey(i, e.target.value); setErr(""); }}
                    onKeyDown={(e) => {
                      if (e.key === "Backspace" && !otp[i] && i > 0) otpRefs.current[i - 1]?.focus();
                      if (e.key === "Enter" && otp.every(Boolean)) handleVerifyOtp();
                    }}
                    className="h-12 w-10 rounded-xl border border-slate-600 bg-slate-900 text-center text-lg font-bold text-white focus:border-amber-500 focus:outline-none transition-colors"
                  />
                ))}
              </div>

              {/* Demo code hint */}
              <div className="mt-3 rounded-lg border border-amber-800/40 bg-amber-900/20 px-3 py-2 flex items-center gap-2">
                <span className="text-amber-400 text-xs">💡</span>
                <p className="text-xs text-amber-300">
                  <span className="font-semibold">Demo mode:</span> Code <span className="font-mono font-bold tracking-widest">{foundUser.demoCode}</span> is auto-filled
                </p>
              </div>
            </div>

            {err && (
              <div className="mb-3 flex items-start gap-2 rounded-xl border border-red-800/50 bg-red-900/20 px-3.5 py-3">
                <span className="text-red-400 mt-0.5 text-sm shrink-0">⚠️</span>
                <p className="text-xs text-red-300 leading-relaxed">{err}</p>
              </div>
            )}

            <button
              onClick={handleVerifyOtp}
              disabled={otp.some(d => !d) || (foundUser.requiresSchoolCode && !schoolCode.trim()) || loading}
              className="w-full rounded-xl bg-amber-500 py-3 font-bold text-slate-900 hover:bg-amber-400 disabled:opacity-40 transition-colors"
            >
              {loading ? (
                <span className="flex items-center justify-center gap-2">
                  <span className="h-4 w-4 rounded-full border-2 border-slate-900/30 border-t-slate-900 animate-spin"/>
                  Verifying…
                </span>
              ) : "Sign In →"}
            </button>

            <button
              onClick={resetToPhone}
              className="mt-3 w-full text-center text-xs text-slate-500 hover:text-slate-300 py-1.5"
            >
              ← Change number
            </button>
          </>
        )}
      </div>

      {/* Security notice */}
      <div className="mt-4 w-full max-w-sm rounded-xl border border-slate-700 bg-slate-800/60 px-4 py-2.5 text-center">
        <p className="text-xs text-slate-400">
          <span className="font-semibold text-[#ffd000]">OrbitTrack</span> — Access restricted to school-enrolled users
        </p>
      </div>
    </div>
    </>
  );
}
