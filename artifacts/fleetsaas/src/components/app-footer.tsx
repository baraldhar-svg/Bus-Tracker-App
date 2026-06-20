import { useState } from "react";

export default function AppFooter({ variant = "light" }: { variant?: "light" | "dark" }) {
  const dark = variant === "dark";
  const [revealed, setRevealed] = useState(false);

  return (
    <footer className={`w-full border-t ${dark ? "border-slate-800 bg-slate-900/80" : "border-border bg-card/60"} backdrop-blur-sm`}>
      <div className="mx-auto max-w-2xl px-5 py-4 flex flex-col items-center gap-2 text-center">

        {/* Copyright + Legal links */}
        <p className={`text-[11px] ${dark ? "text-slate-400" : "text-muted-foreground"}`}>
          © 2026 OrbitTrack. All Rights Reserved.{" "}
          <span className={`mx-1 ${dark ? "text-slate-600" : "text-border"}`}>|</span>
          <button className={`underline-offset-2 hover:underline transition-colors ${dark ? "text-slate-400 hover:text-amber-400" : "text-muted-foreground hover:text-primary"}`}>
            Privacy Policy
          </button>
          <span className={`mx-1 ${dark ? "text-slate-600" : "text-border"}`}>|</span>
          <button className={`underline-offset-2 hover:underline transition-colors ${dark ? "text-slate-400 hover:text-amber-400" : "text-muted-foreground hover:text-primary"}`}>
            Terms of Service
          </button>
        </p>

        {/* Support helpline — click to reveal */}
        <div className="flex items-center gap-1.5 text-[11px] font-medium">
          <span className="text-[13px]">📞</span>
          {revealed ? (
            <a
              href="tel:+9779840077623"
              className={`font-semibold transition-colors ${dark ? "text-amber-400 hover:text-amber-300" : "text-amber-600 hover:text-amber-700"}`}
            >
              +977 9840077623
            </a>
          ) : (
            <button
              onClick={() => setRevealed(true)}
              className={`underline underline-offset-2 transition-colors ${dark ? "text-slate-400 hover:text-amber-400" : "text-muted-foreground hover:text-amber-600"}`}
            >
              Support Contact
            </button>
          )}
        </div>

        {/* Attribution badge */}
        <div
          className={`
            group inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-[10px] font-semibold
            transition-all duration-200 cursor-default
            hover:scale-105 hover:shadow-sm
            ${dark
              ? "border-slate-700 bg-slate-800 text-slate-400 hover:border-amber-500/50 hover:text-amber-400 hover:bg-slate-700 hover:shadow-amber-500/10"
              : "border-border bg-muted text-muted-foreground hover:border-amber-400 hover:text-amber-600 hover:bg-amber-50 dark:hover:bg-amber-950/20 hover:shadow-amber-500/10"
            }
          `}
        >
          <span className="transition-transform duration-300 group-hover:rotate-12">⚡</span>
          Powered by{" "}
          <span className={`font-bold ${dark ? "text-amber-500" : "text-amber-600"}`}>
            Istuti Soft Tec
          </span>
        </div>

      </div>
    </footer>
  );
}
