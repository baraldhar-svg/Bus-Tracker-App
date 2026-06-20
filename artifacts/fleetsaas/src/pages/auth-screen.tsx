import { useState, useRef, useEffect } from "react";
import { useLocation, useSearch } from "wouter";
import { useAuth } from "@/hooks/use-auth";

type Step = "phone" | "otp" | "register" | "school-admin" | "school-success";

const ROLES = [
  { value: "student", label: "🎓 Student" },
  { value: "staff", label: "👩‍💼 Staff" },
  { value: "driver", label: "🚌 Driver" },
  { value: "admin", label: "🏫 School Admin" },
];

const TITLES = ["Mr.", "Ms.", "Mrs.", "Dr.", "Prof."];

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

// Uniform photo hint — translated by browser locale
const UNIFORM_TRANSLATIONS: Record<string, string> = {
  ne: "कृपया युनिफर्म सहितको फोटोमात्र मान्य हुने छ !",
  hi: "कृपया केवल वर्दी वाली फ़ोटो अपलोड करें !",
  bn: "দয়া করে শুধুমাত্র ইউনিফর্ম পরিহিত ছবি আপলোড করুন !",
  zh: "请仅上传穿制服的照片！",
  ja: "制服を着た写真のみアップロードしてください！",
  ko: "교복 사진만 업로드해 주세요！",
  ar: "يرجى تحميل صور بالزي الرسمي فقط !",
  es: "Por favor, sube solo fotos con uniforme !",
  fr: "Veuillez télécharger uniquement des photos en uniforme !",
  de: "Bitte lade nur Fotos in Uniform hoch !",
  pt: "Por favor, carregue apenas fotos com uniforme !",
  ru: "Пожалуйста, загружайте только фотографии в форме !",
  ur: "براہ کرم صرف یونیفارم والی تصاویر اپ لوڈ کریں !",
  id: "Harap unggah foto berseragam saja !",
  ms: "Sila muat naik gambar berpakaian seragam sahaja !",
  th: "กรุณาอัปโหลดเฉพาะรูปที่สวมชุดนักเรียนเท่านั้น !",
  vi: "Vui lòng chỉ tải lên ảnh mặc đồng phục !",
  tr: "Lütfen yalnızca üniforma fotoğrafı yükleyin !",
  it: "Si prega di caricare solo foto in uniforme !",
  pl: "Prosimy przesyłać tylko zdjęcia w mundurku !",
  sw: "Tafadhali pakia picha za sare tu !",
};

function getUniformHint(): string {
  const lang = (navigator.language ?? "en").split("-")[0].toLowerCase();
  const translation = UNIFORM_TRANSLATIONS[lang];
  if (!translation || lang === "en") {
    return "📸 Please upload uniform photos only! (कृपया युनिफर्म सहितको फोटोमात्र मान्य हुने छ !)";
  }
  return `📸 Please upload uniform photos only! (${translation})`;
}

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

function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => resolve(e.target?.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
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
  const [schoolName, setSchoolName] = useState("");
  const [schoolCode, setSchoolCode] = useState("");
  const [photoUrl, setPhotoUrl] = useState("");
  const [photoPreview, setPhotoPreview] = useState("");

  // School admin extra fields
  const [saSchoolName, setSaSchoolName] = useState("");
  const [address, setAddress] = useState("");
  const [contactPhone, setContactPhone] = useState("");
  const [bannerUrl, setBannerUrl] = useState("");
  const [generatedCode, setGeneratedCode] = useState("");
  const [codeCopied, setCodeCopied] = useState(false);

  const otpRefs = useRef<(HTMLInputElement | null)[]>([]);
  const galleryInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);
  const bannerGalleryRef = useRef<HTMLInputElement>(null);
  const bannerCameraRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (demoCode && step === "otp") setOtp(demoCode.split(""));
  }, [demoCode, step]);

  async function handlePhotoFile(file: File | null) {
    if (!file) return;
    const dataUrl = await fileToDataUrl(file);
    setPhotoUrl(dataUrl);
    setPhotoPreview(dataUrl);
  }

  async function handleSendOtp() {
    setErr(""); setLoading(true);
    try {
      const data = await apiPost("/auth/send-otp", { phone });
      setDemoCode(data.demoCode);
      setStep("otp");
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : "Failed");
    } finally { setLoading(false); }
  }

  async function handleVerifyOtp() {
    setErr(""); setLoading(true);
    const code = otp.join("");
    try {
      const data = await apiPost("/auth/verify-otp", { phone, code });
      if (data.user) {
        login({ ...data.user, tenant: data.user.tenant ?? null });
        navigate("/dashboard");
      } else {
        setStep("register");
      }
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : "Invalid code");
    } finally { setLoading(false); }
  }

  async function handleRegister() {
    if (role === "admin") { setStep("school-admin"); return; }
    setErr(""); setLoading(true);
    try {
      const user = await apiPost("/auth/register", {
        phone, name, title, role,
        schoolCode: schoolCode || undefined,
        photoUrl: photoUrl || undefined,
      });
      login({ ...user, tenant: user.tenant ?? null });
      navigate("/dashboard");
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : "Registration failed");
    } finally { setLoading(false); }
  }

  async function handleSchoolRegister() {
    setErr(""); setLoading(true);
    try {
      const data = await apiPost("/auth/register-school", {
        phone, adminName: name, schoolName: saSchoolName, address, contactPhone,
        bannerUrl: bannerUrl || undefined,
      });
      login({ ...data.user, tenant: { ...data.tenant, schoolCode: data.schoolCode } });
      setGeneratedCode(data.schoolCode);
      setStep("school-success");
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : "Registration failed");
    } finally { setLoading(false); }
  }

  async function handleCopyCode() {
    if (!generatedCode) return;
    await navigator.clipboard.writeText(generatedCode);
    setCodeCopied(true);
    setTimeout(() => setCodeCopied(false), 2500);
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
      {/* Hidden file inputs — profile photo */}
      <input ref={galleryInputRef} type="file" accept="image/*" className="hidden"
        onChange={(e) => handlePhotoFile(e.target.files?.[0] ?? null)} />
      <input ref={cameraInputRef} type="file" accept="image/*" capture="user" className="hidden"
        onChange={(e) => handlePhotoFile(e.target.files?.[0] ?? null)} />
      {/* Hidden file inputs — school banner */}
      <input ref={bannerGalleryRef} type="file" accept="image/*" className="hidden"
        onChange={async (e) => { const f = e.target.files?.[0]; if (f) setBannerUrl(await fileToDataUrl(f)); }} />
      <input ref={bannerCameraRef} type="file" accept="image/*" capture="environment" className="hidden"
        onChange={async (e) => { const f = e.target.files?.[0]; if (f) setBannerUrl(await fileToDataUrl(f)); }} />

      <div className="w-full max-w-sm rounded-2xl bg-slate-800 border border-slate-700 p-6 shadow-2xl">
        <div className="mb-6 flex flex-col items-center gap-2">
          <span className="text-5xl bus-float">🚌</span>
          <h1 className="text-2xl font-black text-white">
            Orbit<span className="text-[#ffee47]">Track</span>
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
                <input type="tel" placeholder="98XXXXXXXX" value={phone}
                  onChange={(e) => setPhone(e.target.value.replace(/\D/g, "").slice(0, 10))}
                  className="flex-1 bg-transparent text-sm text-white placeholder:text-slate-600 outline-none"
                  onKeyDown={(e) => e.key === "Enter" && handleSendOtp()} />
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
                <input key={i} ref={(el) => { otpRefs.current[i] = el; }}
                  type="text" inputMode="numeric" maxLength={1} value={d}
                  onChange={(e) => handleOtpKey(i, e.target.value)}
                  className="h-12 w-10 rounded-xl border border-slate-600 bg-slate-900 text-center text-lg font-bold text-white focus:border-amber-500 outline-none transition-colors" />
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
              {/* Role picker */}
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
              {/* Title + Name */}
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
              {/* School Name + Code (for non-admin) */}
              {role !== "admin" && (
                <>
                  <div>
                    <label className="mb-1 block text-xs font-semibold text-slate-300">School / College Name</label>
                    <input value={schoolName} onChange={(e) => setSchoolName(e.target.value)} placeholder="Himalayan Public School"
                      className="w-full rounded-xl border border-slate-600 bg-slate-900 px-3 py-2.5 text-sm text-white placeholder:text-slate-600 outline-none focus:border-amber-500" />
                  </div>
                  <div>
                    <label className="mb-1 block text-xs font-semibold text-slate-300">
                      School Code <span className="text-slate-500">(from your school admin)</span>
                    </label>
                    <input value={schoolCode} onChange={(e) => setSchoolCode(e.target.value.toUpperCase())} placeholder="e.g. ORBIT2024"
                      className="w-full rounded-xl border border-slate-600 bg-slate-900 px-3 py-2.5 text-sm font-mono text-white placeholder:text-slate-600 outline-none focus:border-amber-500" />
                  </div>
                </>
              )}
              {/* Photo picker */}
              <div>
                <label className="mb-1.5 block text-xs font-semibold text-slate-300">
                  Profile Photo <span className="text-slate-500">(optional)</span>
                </label>
                {photoPreview ? (
                  <div className="relative">
                    <img src={photoPreview} alt="preview"
                      className="h-20 w-20 rounded-full object-cover border-2 border-amber-500 mx-auto block" />
                    <button onClick={() => { setPhotoUrl(""); setPhotoPreview(""); }}
                      className="absolute top-0 right-0 left-0 mx-auto w-fit rounded-full bg-red-600 px-2 py-0.5 text-[10px] text-white mt-1 translate-x-8">
                      Remove
                    </button>
                  </div>
                ) : (
                  <div className="grid grid-cols-2 gap-2">
                    <button onClick={() => galleryInputRef.current?.click()}
                      className="flex items-center justify-center gap-1.5 rounded-xl border border-slate-600 bg-slate-900 py-3 text-xs font-medium text-slate-300 hover:border-amber-500 hover:text-amber-400 transition-colors">
                      📁 Upload Photo
                    </button>
                    <button onClick={() => cameraInputRef.current?.click()}
                      className="flex items-center justify-center gap-1.5 rounded-xl border border-slate-600 bg-slate-900 py-3 text-xs font-medium text-slate-300 hover:border-amber-500 hover:text-amber-400 transition-colors">
                      📷 Take Photo
                    </button>
                  </div>
                )}
                <div className="mt-2 rounded-lg border border-amber-700/40 bg-amber-900/20 px-3 py-2 text-xs text-amber-300">
                  {getUniformHint()}
                </div>
              </div>
            </div>
            {err && <p className="mt-3 text-xs text-red-400">{err}</p>}
            <button onClick={handleRegister} disabled={!name || loading}
              className="mt-5 w-full rounded-xl bg-amber-500 py-3 font-bold text-slate-900 hover:bg-amber-400 disabled:opacity-50 transition-colors">
              {loading ? "Creating account…" : role === "admin" ? "Continue →" : "Join OrbitTrack →"}
            </button>
          </>
        )}

        {/* STEP: School Created Success */}
        {step === "school-success" && (
          <>
            <div className="mb-5 flex flex-col items-center gap-2 text-center">
              <span className="text-4xl">🎉</span>
              <h2 className="text-lg font-bold text-slate-100">School Registered!</h2>
              <p className="text-xs text-slate-400">Share this code with your students, staff, and drivers so they can join your school on OrbitTrack.</p>
            </div>
            <div className="rounded-2xl border border-amber-500/50 bg-amber-500/10 p-5 space-y-3 mb-5">
              <p className="text-xs font-semibold text-amber-400 uppercase tracking-wider text-center">Your School Code</p>
              <p className="text-2xl font-black text-white text-center tracking-widest font-mono">{generatedCode}</p>
              <button
                onClick={handleCopyCode}
                className={`w-full rounded-xl py-2.5 text-sm font-bold transition-all ${codeCopied ? "bg-green-600 text-white" : "bg-amber-500 text-slate-900 hover:bg-amber-400"}`}
              >
                {codeCopied ? "✓ Copied to Clipboard!" : "📋 Copy Code"}
              </button>
            </div>
            <div className="rounded-xl border border-slate-700 bg-slate-900/60 px-4 py-3 text-xs text-slate-400 space-y-1 mb-5">
              <p className="font-semibold text-slate-300">How to share:</p>
              <p>• Students & staff enter this code when registering</p>
              <p>• They'll be automatically linked to <span className="text-amber-400 font-medium">{saSchoolName}</span></p>
              <p>• You can always find this code in your Admin dashboard</p>
            </div>
            <button onClick={() => navigate("/dashboard")}
              className="w-full rounded-xl bg-slate-700 py-3 font-bold text-white hover:bg-slate-600 transition-colors">
              Go to Dashboard →
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
                <input value={saSchoolName} onChange={(e) => setSaSchoolName(e.target.value)} placeholder="Himalayan Public School"
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
                <label className="mb-1.5 block text-xs font-semibold text-slate-300">
                  School Banner <span className="text-slate-500">(shown on your school page)</span>
                </label>
                {bannerUrl ? (
                  <div className="space-y-2">
                    <img src={bannerUrl} alt="banner preview" className="h-20 w-full rounded-lg object-cover border border-slate-700" />
                    <button onClick={() => setBannerUrl("")} className="text-xs text-red-400 hover:text-red-300">Remove banner</button>
                  </div>
                ) : (
                  <div className="grid grid-cols-2 gap-2">
                    <button type="button" onClick={() => bannerGalleryRef.current?.click()}
                      className="flex items-center justify-center gap-1.5 rounded-xl border border-slate-600 bg-slate-900 py-3 text-xs font-medium text-slate-300 hover:border-amber-500 hover:text-amber-400 transition-colors">
                      📁 Upload Photo
                    </button>
                    <button type="button" onClick={() => bannerCameraRef.current?.click()}
                      className="flex items-center justify-center gap-1.5 rounded-xl border border-slate-600 bg-slate-900 py-3 text-xs font-medium text-slate-300 hover:border-amber-500 hover:text-amber-400 transition-colors">
                      📷 Take Photo
                    </button>
                  </div>
                )}
              </div>
            </div>
            {err && <p className="mt-3 text-xs text-red-400">{err}</p>}
            <button onClick={handleSchoolRegister} disabled={!saSchoolName || loading}
              className="mt-5 w-full rounded-xl bg-amber-500 py-3 font-bold text-slate-900 hover:bg-amber-400 disabled:opacity-50 transition-colors">
              {loading ? "Registering school…" : "Create School Account →"}
            </button>
            <button onClick={() => setStep("register")} className="mt-2 w-full text-center text-xs text-slate-500 hover:text-slate-300">← Back</button>
          </>
        )}
      </div>

      <div className="mt-4 rounded-xl border border-slate-700 bg-slate-800/60 px-4 py-2.5 text-center">
        <p className="text-xs text-slate-400">
          <span className="text-amber-400 font-semibold">Demo mode:</span> Use any Nepal number (98XXXXXXXX) — OTP is auto-filled
        </p>
      </div>
    </div>
  );
}
