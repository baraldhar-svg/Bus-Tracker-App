import { useState, useRef, useCallback, useEffect } from "react";
import { useLocation } from "wouter";
import { useAuth } from "@/hooks/use-auth";

type Step = "phone" | "login" | "new" | "admin_form" | "admin_pending";

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

interface FoundUser {
  name: string;
  role: string;
  requiresSchoolCode: boolean;
  demoCode: string;
}

const ROLE_LABELS: Record<string, string> = {
  student: "Student",
  staff: "Staff",
  driver: "Driver",
  admin: "Admin",
};

const CLASS_OPTIONS = [
  "Play Group", "Nursery", "LKG", "UKG",
  "1", "2", "3", "4", "5", "6", "7", "8", "9", "10", "11", "12",
  "Others",
];

const FACULTY_OPTIONS = [
  "Science",
  "Management",
  "Humanities/Arts",
  "Law",
  "Education",
  "Engineering",
  "Medical/Nursing",
  "BCA/CSIT",
  "BBA",
  "Vocational",
  "Others",
];

const FACULTY_CLASSES = new Set(["11", "12", "Others"]);

export default function RegisterScreen() {
  const { login } = useAuth();
  const [, navigate] = useLocation();

  const [step, setStep] = useState<Step>("phone");
  const [phone, setPhone] = useState("");
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState("");

  // Existing-user login state
  const [foundUser, setFoundUser] = useState<FoundUser | null>(null);
  const [otp, setOtp] = useState(["", "", "", "", "", ""]);
  const [schoolCode, setSchoolCode] = useState("");
  const otpRefs = useRef<(HTMLInputElement | null)[]>([]);

  // New-user registration state
  const [name, setName] = useState("");
  const [role, setRole] = useState("student");
  const [regSchoolCode, setRegSchoolCode] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);

  // Student-specific registration state
  const [className, setClassName] = useState("");
  const [customClass, setCustomClass] = useState("");
  const [section, setSection] = useState("");
  const [rollNumber, setRollNumber] = useState("");
  const [faculty, setFaculty] = useState("");
  const [customFaculty, setCustomFaculty] = useState("");

  // Admin registration state
  const [adminSchoolName, setAdminSchoolName] = useState("");
  const [adminContactName, setAdminContactName] = useState("");
  const [adminLandline, setAdminLandline] = useState("");
  const [adminEmail, setAdminEmail] = useState("");
  const [adminPosition, setAdminPosition] = useState("");
  const [adminMobile, setAdminMobile] = useState("");
  const [adminName, setAdminName] = useState("");

  // Geo-detection state — null = detecting, true = Nepal, false = international
  const [isNepal, setIsNepal] = useState<boolean | null>(null);

  useEffect(() => {
    if (step !== "admin_pending") return;
    setIsNepal(null);
    fetch("https://ipapi.co/json/")
      .then(r => r.json())
      .then((d: { country_code?: string }) => setIsNepal(d.country_code === "NP"))
      .catch(() => {
        // Fallback: Nepal mobile numbers start with 97x / 98x / 96x
        setIsNepal(/^9[6-8]/.test(adminMobile));
      });
  }, [step, adminMobile]);

  function resetToPhone() {
    setStep("phone");
    setFoundUser(null);
    setOtp(["", "", "", "", "", ""]);
    setSchoolCode("");
    setName("");
    setRegSchoolCode("");
    setErr("");
  }

  // ── Step 1: Check phone ───────────────────────────────────────────────
  async function handleCheckPhone() {
    setErr(""); setLoading(true);
    try {
      const data = await apiPost("/auth/check-phone", { phone });
      // Existing user found — go to OTP login
      setFoundUser(data as FoundUser);
      // Auto-fill demo OTP
      const digits = String((data as FoundUser).demoCode).split("").slice(0, 6);
      setOtp(digits.concat(Array(6 - digits.length).fill("")));
      setStep("login");
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "Error";
      // 403 = not registered → go to new-account form
      if (msg.toLowerCase().includes("not registered") || msg.toLowerCase().includes("not found")) {
        setStep("new");
      } else {
        setErr(msg);
      }
    } finally { setLoading(false); }
  }

  // ── Step 2a: OTP login for existing user ─────────────────────────────
  function handleOtpKey(i: number, val: string) {
    if (!/^\d?$/.test(val)) return;
    const next = [...otp];
    next[i] = val;
    setOtp(next);
    if (val && i < 5) otpRefs.current[i + 1]?.focus();
  }

  function handleOtpPaste(e: React.ClipboardEvent) {
    const digits = e.clipboardData.getData("text").replace(/\D/g, "").slice(0, 6).split("");
    if (digits.length === 0) return;
    e.preventDefault();
    setOtp(digits.concat(Array(6 - digits.length).fill("")));
    otpRefs.current[Math.min(digits.length, 5)]?.focus();
  }

  async function handleVerifyOtp() {
    setErr(""); setLoading(true);
    try {
      const code = otp.join("");
      const result = await apiPost("/auth/verify-otp", {
        phone,
        code,
        schoolCode: schoolCode.trim() || undefined,
      });
      login({ ...result.user, tenant: result.user?.tenant ?? null });
      navigate("/dashboard");
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : "Verification failed");
    } finally { setLoading(false); }
  }

  // ── Step 2b: Register new user ────────────────────────────────────────
  const handleAdminRegister = useCallback(async () => {
    if (!adminSchoolName.trim()) { setErr("School name is required"); return; }
    if (!adminContactName.trim()) { setErr("Contact name is required"); return; }
    if (!adminLandline.trim()) { setErr("Landline number is required"); return; }
    if (!adminEmail.trim() || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(adminEmail)) { setErr("Enter a valid school email"); return; }
    if (!adminName.trim()) { setErr("Your name is required"); return; }
    if (!adminPosition.trim()) { setErr("Position/designation is required"); return; }
    if (!adminMobile.trim() || adminMobile.length < 10) { setErr("Enter your 10-digit mobile number"); return; }
    setErr(""); setLoading(true);
    try {
      await apiPost("/auth/register-admin", {
        schoolName: adminSchoolName.trim(),
        contactName: adminContactName.trim(),
        landline: adminLandline.trim(),
        email: adminEmail.trim(),
        adminName: adminName.trim(),
        position: adminPosition.trim(),
        mobile: adminMobile.trim(),
      });
      setStep("admin_pending");
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : "Registration failed");
    } finally { setLoading(false); }
  }, [adminSchoolName, adminContactName, adminLandline, adminEmail, adminName, adminPosition, adminMobile]);

  const handleRegister = useCallback(async () => {
    if (!name.trim()) { setErr("Name is required"); return; }
    if (password && password.length < 6) { setErr("Password must be at least 6 characters"); return; }
    if (password && password !== confirmPassword) { setErr("Passwords do not match"); return; }
    setErr(""); setLoading(true);
    try {
      const effectiveClass = className === "Others" ? "Others" : className;
      const user = await apiPost("/auth/register", {
        phone,
        name: name.trim(),
        role,
        schoolCode: regSchoolCode.trim() || undefined,
        password: password || undefined,
        ...(role === "student" ? {
          className: effectiveClass || undefined,
          customClass: className === "Others" ? customClass.trim() || undefined : undefined,
          section: section.trim() || undefined,
          rollNumber: rollNumber.trim() || undefined,
          faculty: FACULTY_CLASSES.has(className)
            ? (faculty === "Others" ? customFaculty.trim() || "Others" : faculty || undefined)
            : undefined,
        } : {}),
      });
      login({ ...user, tenant: user.tenant ?? null });
      navigate("/dashboard");
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "Registration failed";
      if (msg.toLowerCase().includes("already registered")) {
        setErr("This number already has an account. Use Sign In instead.");
      } else {
        setErr(msg);
      }
    } finally { setLoading(false); }
  }, [phone, name, role, regSchoolCode, password, confirmPassword, className, customClass, section, rollNumber, faculty, customFaculty, login, navigate]);

  return (
    <div className="flex min-h-[100dvh] flex-col items-center justify-center bg-[#0F172A] px-4 py-8">
      <div className="w-full max-w-sm rounded-2xl bg-slate-800 border border-slate-700 p-6 shadow-2xl">

        {/* Back button */}
        <div className="mb-4">
          <button
            onClick={() => step === "phone" ? navigate("/") : resetToPhone()}
            className="flex items-center gap-1.5 text-xs text-slate-500 hover:text-slate-300 transition-colors"
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
            </svg>
            {step === "phone" ? "Back" : "Change number"}
          </button>
        </div>

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
              <h2 className="text-lg font-bold text-slate-100">Create your account</h2>
              <p className="text-sm text-slate-400 mt-1">Enter your mobile number to get started</p>
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
                  <span className="h-4 w-4 rounded-full border-2 border-slate-900/30 border-t-slate-900 animate-spin" />
                  Checking…
                </span>
              ) : "Continue →"}
            </button>

            <p className="mt-4 text-center text-xs text-slate-500">
              Already have an account?{" "}
              <button onClick={() => navigate("/auth")} className="text-amber-400 hover:text-amber-300 font-semibold">Sign In</button>
            </p>
          </>
        )}

        {/* ── STEP: Existing account found — OTP login ── */}
        {step === "login" && foundUser && (
          <>
            {/* Account found banner */}
            <div className="mb-5 flex items-center gap-3 rounded-xl border border-green-700/40 bg-green-950/30 px-4 py-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-green-500/20 text-green-400 font-black text-sm">
                {foundUser.name.charAt(0).toUpperCase()}
              </div>
              <div className="min-w-0">
                <p className="text-xs font-semibold text-green-300">Account already exists!</p>
                <p className="text-sm font-bold text-white truncate">{foundUser.name}</p>
                <p className="text-xs text-slate-400">{ROLE_LABELS[foundUser.role] ?? foundUser.role}</p>
              </div>
            </div>

            <p className="mb-4 text-center text-sm text-slate-400">
              Sign in to your existing account instead
            </p>

            {/* School code */}
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
              </div>
            )}

            {/* OTP */}
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
              className="w-full rounded-xl bg-green-600 py-3 font-bold text-white hover:bg-green-500 disabled:opacity-40 transition-colors"
            >
              {loading ? (
                <span className="flex items-center justify-center gap-2">
                  <span className="h-4 w-4 rounded-full border-2 border-white/30 border-t-white animate-spin" />
                  Signing in…
                </span>
              ) : "Sign In to Existing Account →"}
            </button>
          </>
        )}

        {/* ── STEP: New account form ── */}
        {step === "new" && (
          <>
            {/* New number banner */}
            <div className="mb-5 flex items-center gap-3 rounded-xl border border-blue-700/40 bg-blue-950/30 px-4 py-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-blue-500/20 text-blue-300 text-xl">
                🆕
              </div>
              <div>
                <p className="text-xs font-semibold text-blue-300">New number detected</p>
                <p className="text-[11px] text-slate-400 mt-0.5">+977 {phone} · Fill in your details to register</p>
              </div>
            </div>

            {/* Role picker — always visible */}
            <div className="mb-4">
              <label className="mb-1.5 block text-xs font-semibold text-slate-300 uppercase tracking-wide">I am a…</label>
              <div className="grid grid-cols-2 gap-2">
                {(["student", "staff", "driver", "admin"] as const).map((r) => (
                  <button
                    key={r}
                    type="button"
                    onClick={() => { setRole(r); setErr(""); }}
                    className={`rounded-xl border py-2.5 text-xs font-semibold capitalize transition-all ${
                      role === r
                        ? "border-amber-500 bg-amber-500/10 text-amber-300"
                        : "border-slate-600 bg-slate-900 text-slate-400 hover:border-slate-500"
                    }`}
                  >
                    {ROLE_LABELS[r]}
                  </button>
                ))}
              </div>
            </div>

            {/* Admin role: show a special CTA — no standard form */}
            {role === "admin" ? (
              <>
                <div className="mb-4 rounded-xl border border-amber-700/40 bg-amber-900/10 px-4 py-3.5">
                  <p className="text-sm font-bold text-amber-300 mb-1">🏫 Register Your School</p>
                  <p className="text-xs text-slate-400 leading-relaxed">
                    School Admin registration requires SuperAdmin verification. You'll fill in your school's details and wait for approval (5–10 minutes). A verification code will then be sent to your school email.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => { setAdminMobile(phone); setStep("admin_form"); setErr(""); }}
                  className="w-full rounded-xl bg-amber-500 py-3 font-bold text-slate-900 hover:bg-amber-400 transition-colors"
                >
                  Register as School Admin →
                </button>
              </>
            ) : (
              <>
                {/* Row 1: Full Name — full width */}
                <div className="mb-3">
                  <label className="mb-1.5 block text-xs font-semibold text-slate-300 uppercase tracking-wide">Full Name</label>
                  <input
                    type="text"
                    placeholder="e.g. Priya Maharjan"
                    value={name}
                    onChange={(e) => { setName(e.target.value); setErr(""); }}
                    className="w-full rounded-xl border border-slate-600 bg-slate-900 px-3 py-2.5 text-sm text-white placeholder:text-slate-600 outline-none focus:border-amber-500 transition-colors"
                  />
                </div>

                {/* Student-specific fields */}
                {role === "student" && (
                  <>
                    {/* Row 2: Class | Section */}
                    <div className="mb-3 grid grid-cols-2 gap-2">
                      <div>
                        <label className="mb-1.5 block text-xs font-semibold text-slate-300 uppercase tracking-wide">Class</label>
                        <select
                          value={className}
                          onChange={(e) => { setClassName(e.target.value); setCustomClass(""); setFaculty(""); setErr(""); }}
                          className="w-full rounded-xl border border-slate-600 bg-slate-900 px-3 py-2.5 text-sm text-white outline-none focus:border-amber-500 transition-colors appearance-none"
                        >
                          <option value="">Select…</option>
                          {CLASS_OPTIONS.map((c) => (
                            <option key={c} value={c}>{c}</option>
                          ))}
                        </select>
                      </div>
                      <div>
                        <label className="mb-1.5 block text-xs font-semibold text-slate-300 uppercase tracking-wide">Section</label>
                        <input
                          type="text"
                          placeholder="e.g. A"
                          value={section}
                          maxLength={5}
                          onChange={(e) => { setSection(e.target.value.toUpperCase()); setErr(""); }}
                          className="w-full rounded-xl border border-slate-600 bg-slate-900 px-3 py-2.5 text-sm text-white placeholder:text-slate-600 outline-none focus:border-amber-500 transition-colors"
                        />
                      </div>
                    </div>

                    {/* Conditional: Others → custom class text input */}
                    {className === "Others" && (
                      <div className="mb-3">
                        <label className="mb-1.5 block text-xs font-semibold text-slate-300 uppercase tracking-wide">
                          Custom Class <span className="text-amber-400">*</span>
                        </label>
                        <input
                          type="text"
                          placeholder="e.g. BBA, B.Ed, MBA"
                          value={customClass}
                          onChange={(e) => { setCustomClass(e.target.value); setErr(""); }}
                          className="w-full rounded-xl border border-amber-600/60 bg-slate-900 px-3 py-2.5 text-sm text-white placeholder:text-slate-600 outline-none focus:border-amber-500 transition-colors"
                          autoFocus
                        />
                      </div>
                    )}

                    {/* Conditional: Faculty for class 11, 12, Others */}
                    {FACULTY_CLASSES.has(className) && (
                      <div className="mb-3">
                        <label className="mb-1.5 block text-xs font-semibold text-slate-300 uppercase tracking-wide">Faculty</label>
                        <select
                          value={faculty}
                          onChange={(e) => { setFaculty(e.target.value); setCustomFaculty(""); setErr(""); }}
                          className="w-full rounded-xl border border-slate-600 bg-slate-900 px-3 py-2.5 text-sm text-white outline-none focus:border-amber-500 transition-colors appearance-none"
                        >
                          <option value="">Select Faculty…</option>
                          {FACULTY_OPTIONS.map((f) => (
                            <option key={f} value={f}>{f}</option>
                          ))}
                        </select>
                        {faculty === "Others" && (
                          <input
                            type="text"
                            placeholder="e.g. Agriculture, Fine Arts, Architecture"
                            value={customFaculty}
                            onChange={(e) => { setCustomFaculty(e.target.value); setErr(""); }}
                            className="mt-2 w-full rounded-xl border border-amber-600/60 bg-slate-900 px-3 py-2.5 text-sm text-white placeholder:text-slate-600 outline-none focus:border-amber-500 transition-colors"
                            autoFocus
                          />
                        )}
                      </div>
                    )}

                    {/* Row 3: Roll Number | School Code */}
                    <div className="mb-4 grid grid-cols-2 gap-2">
                      <div>
                        <label className="mb-1.5 block text-xs font-semibold text-slate-300 uppercase tracking-wide">Roll No.</label>
                        <input
                          type="number"
                          placeholder="e.g. 23"
                          value={rollNumber}
                          onChange={(e) => { setRollNumber(e.target.value); setErr(""); }}
                          className="w-full rounded-xl border border-slate-600 bg-slate-900 px-3 py-2.5 text-sm text-white placeholder:text-slate-600 outline-none focus:border-amber-500 transition-colors [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                        />
                      </div>
                      <div>
                        <label className="mb-1.5 block text-xs font-semibold text-slate-300 uppercase tracking-wide">School Code</label>
                        <input
                          type="text"
                          placeholder="e.g. APEX1234"
                          value={regSchoolCode}
                          onChange={(e) => { setRegSchoolCode(e.target.value.toUpperCase()); setErr(""); }}
                          className="w-full rounded-xl border border-slate-600 bg-slate-900 px-3 py-2.5 text-sm text-white placeholder:text-slate-600 outline-none focus:border-amber-500 transition-colors font-mono"
                          autoCapitalize="characters"
                        />
                      </div>
                    </div>
                  </>
                )}

                {/* Non-student roles: School Code full width */}
                {role !== "student" && (
                  <div className="mb-4">
                    <label className="mb-1.5 block text-xs font-semibold text-slate-300 uppercase tracking-wide">
                      School Code <span className="text-slate-500 normal-case font-normal">(optional)</span>
                    </label>
                    <div className="flex items-center gap-2 rounded-xl border border-slate-600 bg-slate-900 px-3 py-2.5 focus-within:border-amber-500 transition-colors">
                      <span className="text-slate-400 text-sm">🏫</span>
                      <input
                        type="text"
                        placeholder="e.g. GOLDEN202647"
                        value={regSchoolCode}
                        onChange={(e) => { setRegSchoolCode(e.target.value.toUpperCase()); setErr(""); }}
                        className="flex-1 bg-transparent text-sm text-white placeholder:text-slate-600 outline-none font-mono tracking-wider"
                        autoCapitalize="characters"
                      />
                    </div>
                    <p className="mt-1 text-xs text-slate-500">Provided by your school administrator</p>
                  </div>
                )}

                {/* Row 4: Password | Confirm Password */}
                <div className="mb-3 grid grid-cols-2 gap-2">
                  <div>
                    <label className="mb-1.5 block text-xs font-semibold text-slate-300 uppercase tracking-wide">
                      Password <span className="text-slate-500 normal-case font-normal text-[10px]">(opt.)</span>
                    </label>
                    <div className="flex items-center gap-1.5 rounded-xl border border-slate-600 bg-slate-900 px-3 py-2.5 focus-within:border-amber-500 transition-colors">
                      <input
                        type={showPassword ? "text" : "password"}
                        placeholder="Min. 6 chars"
                        value={password}
                        onChange={(e) => { setPassword(e.target.value); setErr(""); }}
                        className="min-w-0 flex-1 bg-transparent text-sm text-white placeholder:text-slate-600 outline-none"
                        autoComplete="new-password"
                      />
                      <button type="button" onClick={() => setShowPassword((v) => !v)}
                        className="shrink-0 text-slate-500 hover:text-slate-300 text-[10px] transition-colors">
                        {showPassword ? "Hide" : "Show"}
                      </button>
                    </div>
                  </div>
                  <div>
                    <label className="mb-1.5 block text-xs font-semibold text-slate-300 uppercase tracking-wide">Confirm</label>
                    <div className={`flex items-center gap-1.5 rounded-xl border bg-slate-900 px-3 py-2.5 transition-colors ${!password ? "border-slate-600 opacity-40 pointer-events-none" : confirmPassword && confirmPassword !== password ? "border-red-600" : confirmPassword === password && confirmPassword ? "border-green-600" : "border-slate-600"}`}>
                      <input
                        type={showPassword ? "text" : "password"}
                        placeholder="Re-enter"
                        value={confirmPassword}
                        onChange={(e) => { setConfirmPassword(e.target.value); setErr(""); }}
                        disabled={!password}
                        className="min-w-0 flex-1 bg-transparent text-sm text-white placeholder:text-slate-600 outline-none disabled:cursor-not-allowed"
                        autoComplete="new-password"
                      />
                      {confirmPassword && password && (
                        <span className="text-xs shrink-0">{confirmPassword === password ? "✓" : "✗"}</span>
                      )}
                    </div>
                  </div>
                </div>

                {!password && (
                  <p className="mb-3 text-[11px] text-slate-500">
                    Skip password to use OTP-only login.
                  </p>
                )}

                {err && (
                  <div className="mb-3 flex items-start gap-2 rounded-xl border border-red-800/50 bg-red-900/20 px-3.5 py-3">
                    <span className="text-red-400 mt-0.5 text-sm shrink-0">⚠️</span>
                    <p className="text-xs text-red-300 leading-relaxed">{err}</p>
                  </div>
                )}

                <button
                  onClick={handleRegister}
                  disabled={!name.trim() || (!!password && password !== confirmPassword) || loading}
                  className="w-full rounded-xl bg-amber-500 py-3 font-bold text-slate-900 hover:bg-amber-400 disabled:opacity-40 transition-colors"
                >
                  {loading ? (
                    <span className="flex items-center justify-center gap-2">
                      <span className="h-4 w-4 rounded-full border-2 border-slate-900/30 border-t-slate-900 animate-spin" />
                      Creating account…
                    </span>
                  ) : "Create Account →"}
                </button>
              </>
            )}
          </>
        )}

        {/* ── STEP: Admin registration form ── */}
        {step === "admin_form" && (
          <>
            <div className="mb-5">
              <h2 className="text-base font-bold text-slate-100 mb-0.5">School Admin Registration</h2>
              <p className="text-xs text-slate-400">Fill in your school details. A SuperAdmin will review within 5–10 minutes.</p>
            </div>

            <div className="space-y-3 mb-4">
              <div>
                <label className="mb-1 block text-xs font-semibold text-slate-300 uppercase tracking-wide">School Name</label>
                <input type="text" placeholder="e.g. Golden Gate International School"
                  value={adminSchoolName}
                  onChange={(e) => { setAdminSchoolName(e.target.value); setErr(""); }}
                  className="w-full rounded-xl border border-slate-600 bg-slate-900 px-3 py-2.5 text-sm text-white placeholder:text-slate-600 outline-none focus:border-amber-500 transition-colors" />
              </div>
              <div>
                <label className="mb-1 block text-xs font-semibold text-slate-300 uppercase tracking-wide">School Contact Person</label>
                <input type="text" placeholder="e.g. Ram Prasad Sharma"
                  value={adminContactName}
                  onChange={(e) => { setAdminContactName(e.target.value); setErr(""); }}
                  className="w-full rounded-xl border border-slate-600 bg-slate-900 px-3 py-2.5 text-sm text-white placeholder:text-slate-600 outline-none focus:border-amber-500 transition-colors" />
              </div>
              <div>
                <label className="mb-1 block text-xs font-semibold text-slate-300 uppercase tracking-wide">School Landline</label>
                <input type="tel" placeholder="e.g. 01-4XXXXXX"
                  value={adminLandline}
                  onChange={(e) => { setAdminLandline(e.target.value); setErr(""); }}
                  className="w-full rounded-xl border border-slate-600 bg-slate-900 px-3 py-2.5 text-sm text-white placeholder:text-slate-600 outline-none focus:border-amber-500 transition-colors" />
              </div>
              <div>
                <label className="mb-1 block text-xs font-semibold text-slate-300 uppercase tracking-wide">School Email</label>
                <input type="email" placeholder="admin@yourschool.edu.np"
                  value={adminEmail}
                  onChange={(e) => { setAdminEmail(e.target.value); setErr(""); }}
                  className="w-full rounded-xl border border-slate-600 bg-slate-900 px-3 py-2.5 text-sm text-white placeholder:text-slate-600 outline-none focus:border-amber-500 transition-colors" />
                <p className="mt-1 text-xs text-slate-500">Verification code will be sent here</p>
              </div>
              <div className="border-t border-slate-700 pt-3">
                <p className="text-xs font-bold text-slate-400 uppercase tracking-wide mb-2">Your Details (Person Registering)</p>
                <div className="space-y-3">
                  <input type="text" placeholder="Your full name"
                    value={adminName}
                    onChange={(e) => { setAdminName(e.target.value); setErr(""); }}
                    className="w-full rounded-xl border border-slate-600 bg-slate-900 px-3 py-2.5 text-sm text-white placeholder:text-slate-600 outline-none focus:border-amber-500 transition-colors" />
                  <input type="text" placeholder="Position / Designation (e.g. Principal)"
                    value={adminPosition}
                    onChange={(e) => { setAdminPosition(e.target.value); setErr(""); }}
                    className="w-full rounded-xl border border-slate-600 bg-slate-900 px-3 py-2.5 text-sm text-white placeholder:text-slate-600 outline-none focus:border-amber-500 transition-colors" />
                  <div className="flex items-center gap-2 rounded-xl border border-slate-600 bg-slate-900 px-3 py-2.5 focus-within:border-amber-500 transition-colors">
                    <span className="text-sm text-slate-400 select-none">🇳🇵 +977</span>
                    <input type="tel" placeholder="Your 10-digit mobile"
                      value={adminMobile}
                      onChange={(e) => { setAdminMobile(e.target.value.replace(/\D/g, "").slice(0, 10)); setErr(""); }}
                      className="flex-1 bg-transparent text-sm text-white placeholder:text-slate-600 outline-none" />
                  </div>
                </div>
              </div>
            </div>

            {err && (
              <div className="mb-3 flex items-start gap-2 rounded-xl border border-red-800/50 bg-red-900/20 px-3.5 py-3">
                <span className="text-red-400 mt-0.5 shrink-0">⚠️</span>
                <p className="text-xs text-red-300 leading-relaxed">{err}</p>
              </div>
            )}

            <button
              onClick={handleAdminRegister}
              disabled={loading}
              className="w-full rounded-xl bg-amber-500 py-3 font-bold text-slate-900 hover:bg-amber-400 disabled:opacity-40 transition-colors"
            >
              {loading ? (
                <span className="flex items-center justify-center gap-2">
                  <span className="h-4 w-4 rounded-full border-2 border-slate-900/30 border-t-slate-900 animate-spin" />
                  Submitting…
                </span>
              ) : "Submit for Verification →"}
            </button>
          </>
        )}

        {/* ── STEP: Admin pending approval — geo-aware, no nav shortcuts ── */}
        {step === "admin_pending" && (
          <div className="py-2 text-center">
            {isNepal === null ? (
              /* Detecting region */
              <div className="py-10 flex flex-col items-center gap-3">
                <span className="h-7 w-7 rounded-full border-2 border-amber-500/30 border-t-amber-400 animate-spin" />
                <p className="text-xs text-slate-400">Detecting your region…</p>
              </div>
            ) : isNepal ? (
              /* ── Nepal locale (Nepali) ── */
              <>
                <div className="text-5xl mb-4">🕐</div>
                <h2 className="text-lg font-black text-amber-400 mb-4">दर्ता सफल भयो!</h2>
                <div className="rounded-xl border border-amber-700/40 bg-amber-900/10 px-4 py-5 text-left">
                  <p className="text-sm text-amber-200 leading-relaxed font-medium">
                    कृपया धैर्य गर्नुस् तपाइँको दर्ता प्रमाणीकरणमा गएको छ ५–१० मिनेटमा तपाइँको स्कूलको इमेलमा भेरिफिकेसन कोड आउनेछ।
                  </p>
                </div>
              </>
            ) : (
              /* ── International locale (English) ── */
              <>
                <div className="text-5xl mb-4">🕐</div>
                <h2 className="text-lg font-black text-amber-400 mb-4">Registration Submitted!</h2>
                <div className="rounded-xl border border-amber-700/40 bg-amber-900/10 px-4 py-5 text-left">
                  <p className="text-sm text-amber-200 leading-relaxed font-medium">
                    Please wait. Your registration is undergoing verification. A verification code will be sent to your school's email address within 5–10 minutes.
                  </p>
                </div>
              </>
            )}
          </div>
        )}
      </div>

      {/* Security notice */}
      <div className="mt-4 w-full max-w-sm rounded-xl border border-slate-700 bg-slate-800/60 px-4 py-2.5 text-center">
        <p className="text-xs text-slate-400">
          <span className="font-semibold text-[#ffd000]">OrbitTrack</span> — Nepal's Smart School Bus Platform
        </p>
      </div>
    </div>
  );
}
