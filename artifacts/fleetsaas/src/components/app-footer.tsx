export default function AppFooter({ variant = "light" }: { variant?: "light" | "dark" }) {
  const dark = variant === "dark";

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



      </div>
    </footer>
  );
}
