import { useState } from "react";
import { startRegistration } from "@simplewebauthn/browser";
import type { AuthUser } from "@/hooks/use-auth";

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

type State = "idle" | "scanning" | "success" | "error";

interface Props {
  user: AuthUser;
  onComplete: (updatedUser?: AuthUser) => void;
}

export default function BiometricSetupModal({ user, onComplete }: Props) {
  const [state, setState] = useState<State>("idle");
  const [errorMsg, setErrorMsg] = useState("");

  async function handleSetup() {
    setState("scanning");
    setErrorMsg("");
    try {
      const options = await apiPost("/auth/webauthn/register-options", { phone: user.phone });
      const response = await startRegistration({ optionsJSON: options });
      const result = await apiPost("/auth/webauthn/register-verify", { phone: user.phone, response });

      localStorage.setItem(
        "orbittrack_biometric",
        JSON.stringify({ phone: user.phone, credentialId: result.credentialId })
      );

      setState("success");
      setTimeout(() => onComplete({ ...user, biometricEnabled: true }), 1200);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Setup failed";
      if (msg.toLowerCase().includes("cancel") || msg.toLowerCase().includes("abort")) {
        setState("idle");
      } else {
        setState("error");
        setErrorMsg(msg);
      }
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-md px-4">
      <div className="relative w-full max-w-sm rounded-3xl border border-slate-700/60 bg-gradient-to-b from-slate-800 to-slate-900 p-8 shadow-2xl text-center">

        {state === "success" ? (
          <>
            <div className="mx-auto mb-4 flex h-20 w-20 items-center justify-center rounded-full bg-green-500/20 ring-2 ring-green-500/40">
              <span className="text-4xl">✅</span>
            </div>
            <h2 className="text-xl font-black text-white mb-2">Biometric Enabled!</h2>
            <p className="text-sm text-slate-400">You can now sign in instantly with your fingerprint or Face ID.</p>
          </>
        ) : (
          <>
            <div className="mx-auto mb-5 flex h-24 w-24 items-center justify-center rounded-full bg-amber-500/10 ring-2 ring-amber-500/30">
              <svg viewBox="0 0 48 48" className="h-14 w-14" fill="none">
                <circle cx="24" cy="24" r="10" stroke="#f59e0b" strokeWidth="2.5" />
                <path d="M24 8C15.163 8 8 15.163 8 24" stroke="#f59e0b" strokeWidth="2.5" strokeLinecap="round" />
                <path d="M24 8C32.837 8 40 15.163 40 24" stroke="#fbbf24" strokeWidth="2.5" strokeLinecap="round" />
                <path d="M12 34c2.364 4.8 7.09 8 12 8" stroke="#f59e0b" strokeWidth="2.5" strokeLinecap="round" />
                <path d="M36 34c-2.364 4.8-7.09 8-12 8" stroke="#fbbf24" strokeWidth="2.5" strokeLinecap="round" />
                <path d="M18 24c0-3.314 2.686-6 6-6s6 2.686 6 6" stroke="#fbbf24" strokeWidth="2" strokeLinecap="round" />
                <circle cx="24" cy="27" r="2" fill="#f59e0b" />
              </svg>
            </div>

            <h2 className="text-xl font-black text-white mb-2">Enable Biometric Login?</h2>
            <p className="text-sm text-slate-400 mb-1">
              Secure your account and sign in instantly next time using
            </p>
            <p className="text-sm font-semibold text-amber-400 mb-6">
              Fingerprint · Face ID · Device PIN
            </p>

            <div className="mb-6 rounded-2xl bg-slate-700/40 border border-slate-700/60 px-4 py-3 text-left space-y-2">
              <div className="flex items-center gap-2 text-xs text-slate-300">
                <span className="text-green-400">✓</span> Your credential stays on this device
              </div>
              <div className="flex items-center gap-2 text-xs text-slate-300">
                <span className="text-green-400">✓</span> No passwords stored on our servers
              </div>
              <div className="flex items-center gap-2 text-xs text-slate-300">
                <span className="text-green-400">✓</span> Instant access under 1 second
              </div>
            </div>

            {state === "error" && (
              <div className="mb-4 rounded-xl bg-red-900/30 border border-red-700/40 px-4 py-2.5 text-xs text-red-300">
                {errorMsg || "Setup failed. Please try again."}
              </div>
            )}

            {state === "scanning" ? (
              <div className="flex flex-col items-center gap-3 py-2">
                <div className="h-10 w-10 rounded-full border-4 border-amber-500/30 border-t-amber-500 animate-spin" />
                <p className="text-sm text-slate-400 animate-pulse">Waiting for biometric scan…</p>
              </div>
            ) : (
              <div className="space-y-3">
                <button
                  onClick={handleSetup}
                  className="w-full rounded-2xl bg-gradient-to-r from-amber-500 to-amber-400 py-3.5 font-bold text-slate-900 shadow-lg hover:from-amber-400 hover:to-amber-300 transition-all active:scale-[0.98]"
                >
                  🔒 Set Up Biometric
                </button>
                <button
                  onClick={() => onComplete()}
                  className="w-full rounded-2xl bg-slate-700/60 py-3 text-sm font-medium text-slate-300 hover:bg-slate-700 transition-colors"
                >
                  Skip for Now
                </button>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
