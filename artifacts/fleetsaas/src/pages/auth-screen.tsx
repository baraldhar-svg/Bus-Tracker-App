import { useState, useRef, useEffect } from "react";
import { useLocation, useSearch } from "wouter";
import { useAuth } from "@/hooks/use-auth";

type Step = "phone" | "otp" | "register" | "school-admin";

const ROLES = [
  { value: "student", label: "🎓 Student" },
  { value: "staff", label: "👩‍💼 Staff" },
  { value: "driver", label: "🚌 Driver" },
  { value: "admin", label: "🏫 School Admin" },
];

const TITLES = ["Mr.", "Ms.", "Mrs.", "Dr.", "Prof."];

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

export default function AuthScreen() {
  const { login } = useAuth();
  const [, navigate] = useLocation();
  const searchStr = useSearch();
  const params = new URLSearchParams(searchStr);
  const initialMode = params.get("mode") ?? "login";

  const [step, setStep] = useState<Step>("phone");
  const [phone, setPhone] = useState("");
  const [otp, setOtp] = useState(["", "", "", "", "", ""]);
  const [demoCode, setDemoCode] = useState("");
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState("");

  // Register form
  const [name, setName] = useState("");
  const [title, setTitle] = useState("Mr.");
  const [role, setRole] = useState("student");
  const [schoolCode, setSchoolCode] = useState("");
  const [photoUrl, setPhotoUrl] = useState("");

  // School admin extra fields
  const [schoolName, setSchoolName] = useState("");
  const [address, setAddress] = useState("");
  const [contactPhone, setContactPhone] = useState("");
  const [bannerUrl, setBannerUrl] = useState("");

  const otpRefs = useRef<(HTMLInputElement | null)[]>([]);

  // Auto-fill OTP in demo mode
  useEffect(() => {
    if (demoCode && step === "otp") {
      const digits = demoCode.split("");
      setOtp(digits);
    }
  }, [demoCode, step]);

  async function handleSendOtp() {
    setErr("");
    setLoading(true);
    try {
      const data = await apiPost("/auth/send-otp", { phone });
      setDemoCode(data.demoCode);
      setStep("otp");
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : "Failed");
    } finally {
      setLoading(false);
    }
  }

  async function handleVerifyOtp() {
    setErr("");
    setLoading(true);
    const code = otp.join("");
    try {
      const data = await apiPost("/auth/verify-otp", { phone, code });
      if (data.user) {
        login({ ...data.user, tenant: data.user.tenant ?? null });
        navigate("/dashboard");
      } else {
        setStep(initialMode === "register" ? "register" : "register");
      }
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : "Invalid code");
    } finally {
      setLoading(false);
    }
  }

  async function handleRegister() {
    if (role === "admin") { setStep("school-admin"); return; }
    setErr("");
    setLoading(true);
    try {
      const user = await apiPost("/auth/register", { phone, name, title, role, schoolCode: schoolCode || undefined, photoUrl: photoUrl || undefined });
      login({ ...user, tenant: null });
      navigate("/dashboard");
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : "Registration failed");
    } finally {
      setLoading(false);
    }
  }

  async function handleSchoolRegister() {
    setErr("");
    setLoading(true);
    try {
      const data = await apiPost("/auth/register-school", { phone, adminName: name, schoolName, address, contactPhone, bannerUrl: bannerUrl || undefined });
      login({ ...data.user, tenant: data.tenant });
      navigate("/dashboard");
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : "Registration failed");
    } finally {
      setLoading(false);
    }
  }

  function handleOtpKey(idx: number, value: string) {
    const next = [...otp];
    next[idx] = value.slice(-1);
    setOtp(next);
    if (value && idx < 5) otpRefs.current[idx + 1]?.focus();
    if (!value && idx > 0) otpRefs.current[idx - 1]?.focus();
  }

  return (
    <div className="flex min-h-[100dvh] flex-col items-center justify-center bg-[#0F172A] px-4 py-8">
      {/* Card */}
      <div className="w-full max-w-sm rounded-2xl bg-slate-800 border border-slate-700 p-6 shadow-2xl">
        {/* Logo */}
        <div className="mb-6 flex flex-col items-center gap-2">
          <span className="text-5xl bus-float">🚌</span>
          <h1 className="text-2xl font-black text-white">
            Orbit<span className="text-amber-400">Track</span>
          </h1>
        </div>

        {/* STEP: Phone */}
        {step === "phone" && (
          <>
            <h2 className="mb-1 text-lg font-bold text-slate-100">
              {initialMode === "register" ? "Create Account" : "Welcome Back"}
            </h2>
            <p className="mb-5 text-sm text-slate-400">Enter your Nepal mobile number to receive a code</p>
            <div className="mb-4">
              <label className="mb-1.5 block text-xs font-semibold text-slate-300">Mobile Number</label>
              <div className="flex items-center gap-2 rounded-xl border border-slate-600 bg-slate-900 px-3 py-2.5 focus-within:border-amber-500 transition-colors">
                <span className="text-sm text-slate-400 select-none">🇳🇵 +977</span>
                <input
                  type="tel"
                  placeholder="98XXXXXXXX"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value.replace(/\D/g, "").slice(0, 10))}
                  className="flex-1 bg-transparent text-sm text-white placeholder:text-slate-600 outline-none"
                  onKeyDown={(e) => e.key === "Enter" && handleSendOtp()}
                />
              </div>
            </div>
            {err && <p className="mb-3 text-xs text-red-400">{err}</p>}
            <button onClick={handleSendOtp} disabled={phone.length < 10 || loading}
              className="w-full rounded-xl bg-amber-500 py-3 font-bold text-slate-900 hover:bg-amber-400 disabled:opacity-50 transition-colors">
              {loading ? "Sending…" : "Send Code →"}
            </button>
            <button onClick={() => navigate("/")} className="mt-3 w-full text-center text-xs text-slate-500 hover:text-slate-300">← Back to Home</button>
          </>
        )}

        {/* STEP: OTP */}
        {step === "otp" && (
          <>
            <h2 className="mb-1 text-lg font-bold text-slate-100">Enter OTP</h2>
            <p className="mb-1 text-sm text-slate-400">Code sent to +977 {phone}</p>
            {demoCode && (
              <div className="mb-4 rounded-lg border border-amber-700/40 bg-amber-900/20 px-3 py-2 text-xs text-amber-300">
                <span className="font-bold">🎯 Demo mode</span> — code auto-filled: {demoCode}
              </div>
            )}
            <div className="mb-5 flex justify-center gap-2">
              {otp.map((d, i) => (
                <input
                  key={i}
                  ref={(el) => { otpRefs.current[i] = el; }}
                  type="text"
                  inputMode="numeric"
                  maxLength={1}
                  value={d}
                  onChange={(e) => handleOtpKey(i, e.target.value)}
                  className="h-12 w-10 rounded-xl border border-slate-600 bg-slate-900 text-center text-lg font-bold text-white focus:border-amber-500 outline-none transition-colors"
                />
              ))}
            </div>
            {err && <p className="mb-3 text-xs text-red-400">{err}</p>}
            <button onClick={handleVerifyOtp} disabled={otp.join("").length < 6 || loading}
              className="w-full rounded-xl bg-amber-500 py-3 font-bold text-slate-900 hover:bg-amber-400 disabled:opacity-50 transition-colors">
              {loading ? "Verifying…" : "Verify & Continue →"}
            </button>
            <button onClick={() => setStep("phone")} className="mt-3 w-full text-center text-xs text-slate-500 hover:text-slate-300">← Change number</button>
          </>
        )}

        {/* STEP: Register */}
        {step === "register" && (
          <>
            <h2 className="mb-1 text-lg font-bold text-slate-100">Create Your Profile</h2>
            <p className="mb-4 text-xs text-slate-400">Registered as: +977 {phone}</p>
            <div className="space-y-3">
              <div>
                <label className="mb-1 block text-xs font-semibold text-slate-300">I am a</label>
                <div className="grid grid-cols-2 gap-2">
                  {ROLES.map((r) => (
                    <button key={r.value} onClick={() => setRole(r.value)}
                      className={`rounded-xl border py-2.5 text-sm font-medium transition-all ${role === r.value ? "border-amber-500 bg-amber-500/10 text-amber-400" : "border-slate-600 text-slate-300 hover:border-slate-500"}`}>
                      {r.label}
                    </button>
                  ))}
                </div>
              </div>
              <div className="grid grid-cols-3 gap-2">
                <div>
                  <label className="mb-1 block text-xs font-semibold text-slate-300">Title</label>
                  <select value={title} onChange={(e) => setTitle(e.target.value)}
                    className="w-full rounded-xl border border-slate-600 bg-slate-900 px-2 py-2.5 text-sm text-white outline-none focus:border-amber-500">
                    {TITLES.map((t) => <option key={t}>{t}</option>)}
                  </select>
                </div>
                <div className="col-span-2">
                  <label className="mb-1 block text-xs font-semibold text-slate-300">Full Name</label>
                  <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Aayush Shrestha"
                    className="w-full rounded-xl border border-slate-600 bg-slate-900 px-3 py-2.5 text-sm text-white placeholder:text-slate-600 outline-none focus:border-amber-500" />
                </div>
              </div>
              {role !== "admin" && (
                <div>
                  <label className="mb-1 block text-xs font-semibold text-slate-300">School Code <span className="text-slate-500">(from your school admin)</span></label>
                  <input value={schoolCode} onChange={(e) => setSchoolCode(e.target.value.toUpperCase())} placeholder="e.g. ORBIT2024"
                    className="w-full rounded-xl border border-slate-600 bg-slate-900 px-3 py-2.5 text-sm font-mono text-white placeholder:text-slate-600 outline-none focus:border-amber-500" />
                </div>
              )}
              <div>
                <label className="mb-1 block text-xs font-semibold text-slate-300">Profile Photo URL <span className="text-slate-500">(optional)</span></label>
                <input value={photoUrl} onChange={(e) => setPhotoUrl(e.target.value)} placeholder="https://..."
                  className="w-full rounded-xl border border-slate-600 bg-slate-900 px-3 py-2.5 text-sm text-white placeholder:text-slate-600 outline-none focus:border-amber-500" />
              </div>
            </div>
            {err && <p className="mt-3 text-xs text-red-400">{err}</p>}
            <button onClick={handleRegister} disabled={!name || loading}
              className="mt-5 w-full rounded-xl bg-amber-500 py-3 font-bold text-slate-900 hover:bg-amber-400 disabled:opacity-50 transition-colors">
              {loading ? "Creating account…" : role === "admin" ? "Continue →" : "Join OrbitTrack →"}
            </button>
          </>
        )}

        {/* STEP: School Admin Extra */}
        {step === "school-admin" && (
          <>
            <h2 className="mb-1 text-lg font-bold text-slate-100">Register Your School</h2>
            <p className="mb-4 text-xs text-slate-400">You'll receive a unique school code to share with your students & staff</p>
            <div className="space-y-3">
              <div>
                <label className="mb-1 block text-xs font-semibold text-slate-300">School / College Name</label>
                <input value={schoolName} onChange={(e) => setSchoolName(e.target.value)} placeholder="Himalayan Public School"
                  className="w-full rounded-xl border border-slate-600 bg-slate-900 px-3 py-2.5 text-sm text-white placeholder:text-slate-600 outline-none focus:border-amber-500" />
              </div>
              <div>
                <label className="mb-1 block text-xs font-semibold text-slate-300">Address</label>
                <input value={address} onChange={(e) => setAddress(e.target.value)} placeholder="Koteshwor, Kathmandu"
                  className="w-full rounded-xl border border-slate-600 bg-slate-900 px-3 py-2.5 text-sm text-white placeholder:text-slate-600 outline-none focus:border-amber-500" />
              </div>
              <div>
                <label className="mb-1 block text-xs font-semibold text-slate-300">School Contact Phone</label>
                <input value={contactPhone} onChange={(e) => setContactPhone(e.target.value)} placeholder="+977 01-XXXXXXX"
                  className="w-full rounded-xl border border-slate-600 bg-slate-900 px-3 py-2.5 text-sm text-white placeholder:text-slate-600 outline-none focus:border-amber-500" />
              </div>
              <div>
                <label className="mb-1 block text-xs font-semibold text-slate-300">School Banner Image URL <span className="text-slate-500">(shown on your school page)</span></label>
                <input value={bannerUrl} onChange={(e) => setBannerUrl(e.target.value)} placeholder="https://your-school-image.jpg"
                  className="w-full rounded-xl border border-slate-600 bg-slate-900 px-3 py-2.5 text-sm text-white placeholder:text-slate-600 outline-none focus:border-amber-500" />
                {bannerUrl && <img src={bannerUrl} alt="banner preview" className="mt-2 h-20 w-full rounded-lg object-cover" onError={(e) => (e.currentTarget.style.display = "none")} />}
              </div>
            </div>
            {err && <p className="mt-3 text-xs text-red-400">{err}</p>}
            <button onClick={handleSchoolRegister} disabled={!schoolName || loading}
              className="mt-5 w-full rounded-xl bg-amber-500 py-3 font-bold text-slate-900 hover:bg-amber-400 disabled:opacity-50 transition-colors">
              {loading ? "Registering school…" : "Create School Account →"}
            </button>
            <button onClick={() => setStep("register")} className="mt-2 w-full text-center text-xs text-slate-500 hover:text-slate-300">← Back</button>
          </>
        )}
      </div>

      {/* Demo hint */}
      <div className="mt-4 rounded-xl border border-slate-700 bg-slate-800/60 px-4 py-2.5 text-center">
        <p className="text-xs text-slate-400">
          <span className="text-amber-400 font-semibold">Demo mode:</span> Use any Nepal number (98XXXXXXXX) — OTP is auto-filled
        </p>
      </div>
    </div>
  );
}
