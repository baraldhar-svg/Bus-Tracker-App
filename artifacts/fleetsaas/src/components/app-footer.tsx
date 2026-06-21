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
          <span className={`mx-1 ${dark ? "text-slate-600" : "text-border"}`}>|</span>
          <a
            href="https://wa.me/9779840077623"
            target="_blank"
            rel="noopener noreferrer"
            className={`inline-flex items-center gap-1 underline-offset-2 hover:underline transition-colors ${dark ? "text-slate-400 hover:text-green-400" : "text-muted-foreground hover:text-green-600"}`}
          >
            <svg viewBox="0 0 24 24" className="h-2.5 w-2.5 shrink-0" style={{ fill: "currentColor" }} xmlns="http://www.w3.org/2000/svg">
              <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347z"/><path d="M12 0C5.373 0 0 5.373 0 12c0 2.127.558 4.126 1.532 5.858L.057 23.882a.5.5 0 0 0 .61.61l6.098-1.464A11.94 11.94 0 0 0 12 24c6.627 0 12-5.373 12-12S18.627 0 12 0zm0 21.9a9.886 9.886 0 0 1-5.031-1.37l-.361-.214-3.741.899.934-3.672-.235-.376A9.865 9.865 0 0 1 2.1 12C2.1 6.534 6.534 2.1 12 2.1c5.466 0 9.9 4.434 9.9 9.9 0 5.466-4.434 9.9-9.9 9.9z"/>
            </svg>
            Contact
          </a>
        </p>



      </div>
    </footer>
  );
}
