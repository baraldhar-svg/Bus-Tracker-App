import { useState, useRef, useEffect } from "react";
import { useLocation, useSearch } from "wouter";
import { useAuth } from "@/hooks/use-auth";

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

type VerifyStep = "form" | "otp" | "done";

export default function AdminVerifyScreen() {
  const { login } = useAuth();
  const [, navigate] = useLocation();
  const search = useSearch();
  const params = new URLSearchParams(search);

  const [step, setStep] = useState<VerifyStep>("form");
  const [mobile, setMobile] = useState(params.get("mobile") ?? "");
  const [schoolCode, setSchoolCode] = useState(params.get("code") ?? "");
  const [schoolName, setSchoolName] = useState("");
  const [demoOtp, setDemoOtp] = useState("");
  const [otp, setOtp] = useState(["", "", "", "", "", ""]);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState("");
  const otpRefs = useRef<(HTMLInputElement | null)[]>([]);

  // Auto-focus first OTP box when entering step
  useEffect(() => {
    if (step === "otp") {
      setTimeout(() => otpRefs.current[0]?.focus(), 80);
    }
  }, [step]);

  async function handleSendOtp() {
    if (!mobile.trim() || !schoolCode.trim()) { setErr("Both fields are required"); return; }
    setErr(""); setLoading(true);
    try {
      const res = await apiPost("/auth/admin-send-otp", { mobile: mobile.trim(), schoolCode: schoolCode.trim().toUpperCase() });
      setSchoolName(res.schoolName ?? "");
      setDemoOtp(res.demoCode ?? "");
      const digits = String(res.demoCode ?? "").split("").slice(0, 6);
      setOtp(digits.concat(Array(6 - digits.length).fill("")));
      setStep("otp");
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : "Failed");
    } finally { setLoading(false); }
  }

  function handleOtpKey(i: number, val: string) {
    if (!/^\d?$/.test(val)) return;
    const next = [...otp];
    next[i] = val;
    setOtp(next);
    if (val && i < 5) otpRefs.current[i + 1]?.focus();
  }

  function handleOtpPaste(e: React.ClipboardEvent) {
    const digits = e.clipboardData.getData("text").replace(/\D/g, "").slice(0, 6).split("");
    if (!digits.length) return;
    e.preventDefault();
    setOtp(digits.concat(Array(6 - digits.length).fill("")));
    otpRefs.current[Math.min(digits.length, 5)]?.focus();
  }

  async function handleVerify() {
    const code = otp.join("");
    if (code.length < 6) { setErr("Enter the 6-digit code"); return; }
    setErr(""); setLoading(true);
    try {
      const result = await apiPost("/auth/admin-verify-otp", { mobile: mobile.trim(), schoolCode: schoolCode.trim().toUpperCase(), otpCode: code });
      login({ ...result.user, tenant: result.user?.tenant ?? null });
      setStep("done");
      setTimeout(() => navigate("/dashboard"), 1200);
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : "Verification failed");
    } finally { setLoading(false); }
  }

  return (
    <div className="flex min-h-[100dvh] flex-col items-center justify-center bg-[#0F172A] px-4 py-8">
      <div className="w-full max-w-sm rounded-2xl bg-slate-800 border border-slate-700 p-6 shadow-2xl">

        <div className="mb-4">
          <button
            onClick={() => step === "otp" ? setStep("form") : navigate("/")}
            className="flex items-center gap-1.5 text-xs text-slate-500 hover:text-slate-300 transition-colors"
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
            </svg>
            Back
          </button>
        </div>

        <div className="mb-6 flex flex-col items-center gap-2">
          <span className="text-5xl">🔐</span>
          <h1 className="text-2xl font-black text-white">Orbit<span className="text-[#ffd000]">Track</span></h1>
          <p className="text-xs text-slate-400 text-center">School Admin Verification</p>
        </div>

        {step === "form" && (
          <>
            <div className="mb-5 text-center">
              <h2 className="text-base font-bold text-slate-100">Verify Your School Account</h2>
              <p className="text-xs text-slate-400 mt-1">Enter the details from your approval email</p>
            </div>

            <div className="space-y-3 mb-4">
              <div>
                <label className="mb-1.5 block text-xs font-semibold text-slate-300 uppercase tracking-wide">Your Mobile Number</label>
                <div className="flex items-center gap-2 rounded-xl border border-slate-600 bg-slate-900 px-3 py-2.5 focus-within:border-amber-500 transition-colors">
                  <span className="text-sm text-slate-400 select-none">🇳🇵 +977</span>
                  <input
                    type="tel"
                    placeholder="98XXXXXXXX"
                    value={mobile}
                    onChange={(e) => { setMobile(e.target.value.replace(/\D/g, "").slice(0, 10)); setErr(""); }}
                    className="flex-1 bg-transparent text-sm text-white placeholder:text-slate-600 outline-none"
                    onKeyDown={(e) => e.key === "Enter" && handleSendOtp()}
                  />
                </div>
              </div>

              <div>
                <label className="mb-1.5 block text-xs font-semibold text-slate-300 uppercase tracking-wide">School Code</label>
                <div className="flex items-center gap-2 rounded-xl border border-slate-600 bg-slate-900 px-3 py-2.5 focus-within:border-amber-500 transition-colors">
                  <span className="text-slate-400 text-sm">🏫</span>
                  <input
                    type="text"
                    placeholder="e.g. GOLDEN202647"
                    value={schoolCode}
                    onChange={(e) => { setSchoolCode(e.target.value.toUpperCase()); setErr(""); }}
                    className="flex-1 bg-transparent text-sm text-white placeholder:text-slate-600 outline-none font-mono tracking-wider"
                    autoCapitalize="characters"
                    onKeyDown={(e) => e.key === "Enter" && handleSendOtp()}
                  />
                </div>
                <p className="mt-1 text-xs text-slate-500">Your unique school code was sent to your email on approval</p>
              </div>
            </div>

            {err && (
              <div className="mb-3 flex items-start gap-2 rounded-xl border border-red-800/50 bg-red-900/20 px-3.5 py-3">
                <span className="text-red-400 mt-0.5 shrink-0">⚠️</span>
                <p className="text-xs text-red-300 leading-relaxed">{err}</p>
              </div>
            )}

            <button
              onClick={handleSendOtp}
              disabled={mobile.length < 10 || !schoolCode.trim() || loading}
              className="w-full rounded-xl bg-amber-500 py-3 font-bold text-slate-900 hover:bg-amber-400 disabled:opacity-40 transition-colors"
            >
              {loading ? (
                <span className="flex items-center justify-center gap-2">
                  <span className="h-4 w-4 rounded-full border-2 border-slate-900/30 border-t-slate-900 animate-spin" />
                  Sending OTP…
                </span>
              ) : "Send WhatsApp OTP →"}
            </button>
          </>
        )}

        {step === "otp" && (
          <>
            <div className="mb-5 text-center">
              <h2 className="text-base font-bold text-slate-100">Enter OTP Code</h2>
              <p className="text-xs text-slate-400 mt-1">
                A 6-digit code was sent to <strong className="text-slate-200">+977 {mobile}</strong> via WhatsApp
              </p>
              {schoolName && (
                <p className="mt-1 text-xs text-amber-400 font-semibold">{schoolName}</p>
              )}
            </div>

            {demoOtp && (
              <div className="mb-3 rounded-xl border border-amber-700/40 bg-amber-900/20 px-3.5 py-2.5 text-center">
                <p className="text-[10px] text-amber-400 font-semibold uppercase tracking-wide mb-0.5">Demo Mode — OTP Code</p>
                <p className="text-xl font-black text-amber-300 tracking-widest">{demoOtp}</p>
                <p className="text-[10px] text-slate-500 mt-0.5">In production, this is sent via WhatsApp</p>
              </div>
            )}

            <div className="mb-5 flex justify-center gap-2">
              {otp.map((digit, i) => (
                <input
                  key={i}
                  ref={(el) => { otpRefs.current[i] = el; }}
                  type="text"
                  inputMode="numeric"
                  maxLength={1}
                  value={digit}
                  onChange={(e) => handleOtpKey(i, e.target.value)}
                  onPaste={i === 0 ? handleOtpPaste : undefined}
                  onKeyDown={(e) => {
                    if (e.key === "Backspace" && !digit && i > 0) otpRefs.current[i - 1]?.focus();
                    if (e.key === "Enter" && otp.join("").length === 6) handleVerify();
                  }}
                  className="h-11 w-10 rounded-xl border border-slate-600 bg-slate-900 text-center text-lg font-bold text-white outline-none focus:border-amber-500 transition-colors"
                />
              ))}
            </div>

            {err && (
              <div className="mb-3 flex items-start gap-2 rounded-xl border border-red-800/50 bg-red-900/20 px-3.5 py-3">
                <span className="text-red-400 mt-0.5 shrink-0">⚠️</span>
                <p className="text-xs text-red-300 leading-relaxed">{err}</p>
              </div>
            )}

            <button
              onClick={handleVerify}
              disabled={otp.join("").length < 6 || loading}
              className="w-full rounded-xl bg-amber-500 py-3 font-bold text-slate-900 hover:bg-amber-400 disabled:opacity-40 transition-colors"
            >
              {loading ? (
                <span className="flex items-center justify-center gap-2">
                  <span className="h-4 w-4 rounded-full border-2 border-slate-900/30 border-t-slate-900 animate-spin" />
                  Verifying…
                </span>
              ) : "Verify & Activate →"}
            </button>

            <button onClick={() => { setStep("form"); setErr(""); }} className="mt-3 w-full text-center text-xs text-slate-500 hover:text-slate-300 transition-colors">
              ← Change details
            </button>
          </>
        )}

        {step === "done" && (
          <div className="py-4 text-center">
            <div className="text-5xl mb-3">✅</div>
            <h2 className="text-base font-bold text-green-400 mb-1">School Verified!</h2>
            <p className="text-xs text-slate-400">Redirecting to your Admin Dashboard…</p>
          </div>
        )}
      </div>

      <div className="mt-4 w-full max-w-sm rounded-xl border border-slate-700 bg-slate-800/60 px-4 py-2.5 text-center">
        <p className="text-xs text-slate-400">
          <span className="font-semibold text-[#ffd000]">OrbitTrack</span> — Nepal's Smart School Bus Platform
        </p>
      </div>
    </div>
  );
}
