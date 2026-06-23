import { useState } from "react";
import { X, CheckCircle, Loader2 } from "lucide-react";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

type Gateway = "esewa" | "khalti" | "connectips";

const GATEWAYS: {
  id: Gateway;
  label: string;
  color: string;
  bg: string;
  border: string;
  logo: string;
}[] = [
  {
    id: "esewa",
    label: "eSewa",
    color: "text-green-700",
    bg: "bg-green-50 hover:bg-green-100 dark:bg-green-950/30 dark:hover:bg-green-950/50",
    border: "border-green-400 dark:border-green-600",
    logo: "https://cdn.esewa.com.np/ui/images/esewa_og.png",
  },
  {
    id: "khalti",
    label: "Khalti",
    color: "text-purple-700",
    bg: "bg-purple-50 hover:bg-purple-100 dark:bg-purple-950/30 dark:hover:bg-purple-950/50",
    border: "border-purple-400 dark:border-purple-600",
    logo: "https://khalti.com/static/images/logo-new-v.svg",
  },
  {
    id: "connectips",
    label: "ConnectIPS",
    color: "text-blue-700",
    bg: "bg-blue-50 hover:bg-blue-100 dark:bg-blue-950/30 dark:hover:bg-blue-950/50",
    border: "border-blue-400 dark:border-blue-600",
    logo: "https://www.connectips.com/images/logo.png",
  },
];

const AMOUNT = 100;

type Phase = "select" | "confirm" | "processing" | "success";

export default function PaymentModal({
  passengerId,
  onClose,
  onSuccess,
}: {
  passengerId: number;
  onClose: () => void;
  onSuccess: () => void;
}) {
  const [gateway, setGateway] = useState<Gateway | null>(null);
  const [phase, setPhase] = useState<Phase>("select");
  const [err, setErr] = useState("");

  function selectGateway(g: Gateway) {
    setGateway(g);
    setPhase("confirm");
    setErr("");
  }

  async function handlePay() {
    if (!gateway) return;
    setPhase("processing");
    setErr("");
    await new Promise((r) => setTimeout(r, 2200));
    try {
      await fetch(`${BASE}/api/passengers/${passengerId}/renew`, {
        method: "POST",
      });
      setPhase("success");
      setTimeout(() => {
        onSuccess();
      }, 1800);
    } catch {
      setErr("Network error. Please try again.");
      setPhase("confirm");
    }
  }

  const gw = GATEWAYS.find((g) => g.id === gateway);

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div className="w-full max-w-sm rounded-2xl border border-border bg-background shadow-2xl overflow-hidden animate-in slide-in-from-bottom-4 duration-300">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-border">
          <div>
            <p className="font-bold text-foreground text-base">
              Renew Bus Access
            </p>
            <p className="text-xs text-muted-foreground mt-0.5">
              Monthly subscription · NPR {AMOUNT.toLocaleString()}
            </p>
          </div>
          {phase !== "processing" && phase !== "success" && (
            <button
              onClick={onClose}
              className="rounded-xl p-2 text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
            >
              <X size={16} />
            </button>
          )}
        </div>

        {/* Gateway selection */}
        {phase === "select" && (
          <div className="p-5 space-y-3">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-4">
              Choose Payment Method
            </p>
            {GATEWAYS.map((g) => (
              <button
                key={g.id}
                onClick={() => selectGateway(g.id)}
                className={`w-full flex items-center gap-4 rounded-xl border px-4 py-3.5 text-left transition-all active:scale-[0.98] ${g.bg} ${g.border}`}
              >
                <div className="h-10 w-14 rounded-lg bg-white flex items-center justify-center border border-border overflow-hidden shrink-0">
                  <img
                    src={g.logo}
                    alt={g.label}
                    className="h-7 w-auto object-contain"
                    onError={(e) => {
                      (e.target as HTMLImageElement).style.display = "none";
                      (e.target as HTMLImageElement).parentElement!.innerHTML =
                        `<span class="text-xs font-bold">${g.label}</span>`;
                    }}
                  />
                </div>
                <div className="flex-1">
                  <p className={`font-bold text-sm ${g.color}`}>{g.label}</p>
                  <p className="text-xs text-muted-foreground">
                    Pay NPR {AMOUNT.toLocaleString()}
                  </p>
                </div>
                <span className="text-muted-foreground text-xs">→</span>
              </button>
            ))}
            <p className="text-[10px] text-muted-foreground text-center pt-2">
              Demo simulation — no actual payment processed
            </p>
          </div>
        )}

        {/* Confirm / processing / success */}
        {phase !== "select" && gw && (
          <div className="p-5 space-y-5">
            {/* Payment details box */}
            <div className="rounded-xl border border-border bg-muted/40 p-4 space-y-2">
              <div className="flex justify-between items-center">
                <span className="text-xs text-muted-foreground">
                  Payment Method
                </span>
                <span className={`text-sm font-bold ${gw.color}`}>
                  {gw.label}
                </span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-xs text-muted-foreground">Plan</span>
                <span className="text-sm font-semibold text-foreground">
                  Bus Access · 30 days
                </span>
              </div>
              <div className="h-px bg-border" />
              <div className="flex justify-between items-center">
                <span className="text-sm font-bold text-foreground">Total</span>
                <span className="text-lg font-bold text-foreground">
                  NPR {AMOUNT.toLocaleString()}
                </span>
              </div>
            </div>

            {err && <p className="text-xs text-red-500 text-center">{err}</p>}

            {/* Processing state */}
            {phase === "processing" && (
              <div className="flex flex-col items-center gap-3 py-4">
                <div
                  className={`h-14 w-14 rounded-full flex items-center justify-center ${gw.bg} ${gw.border} border-2`}
                >
                  <Loader2 size={24} className={`${gw.color} animate-spin`} />
                </div>
                <p className="text-sm font-semibold text-foreground">
                  Processing payment…
                </p>
                <p className="text-xs text-muted-foreground">
                  Please wait, verifying with {gw.label}
                </p>
              </div>
            )}

            {/* Success state */}
            {phase === "success" && (
              <div className="flex flex-col items-center gap-3 py-4">
                <div className="h-14 w-14 rounded-full bg-green-100 dark:bg-green-950/40 flex items-center justify-center border-2 border-green-400">
                  <CheckCircle size={28} className="text-green-600" />
                </div>
                <p className="text-sm font-bold text-foreground">
                  Payment Successful!
                </p>
                <p className="text-xs text-muted-foreground text-center">
                  Bus access renewed for 30 days via {gw.label}
                </p>
              </div>
            )}

            {/* Action buttons */}
            {phase === "confirm" && (
              <div className="flex gap-2">
                <button
                  onClick={() => {
                    setPhase("select");
                    setGateway(null);
                  }}
                  className="flex-1 rounded-xl border border-border py-2.5 text-xs font-medium text-muted-foreground hover:bg-muted transition-colors"
                >
                  Back
                </button>
                <button
                  onClick={handlePay}
                  className={`flex-1 rounded-xl py-2.5 text-xs font-bold text-white transition-colors ${
                    gw.id === "esewa"
                      ? "bg-green-600 hover:bg-green-700"
                      : gw.id === "khalti"
                        ? "bg-purple-600 hover:bg-purple-700"
                        : "bg-blue-600 hover:bg-blue-700"
                  }`}
                >
                  Pay NPR {AMOUNT.toLocaleString()} via {gw.label}
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
