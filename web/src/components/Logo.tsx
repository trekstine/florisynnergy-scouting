/**
 * FloriSynergy brand mark.
 *
 * The mark is a five-petal rose bloom (the crop) inside a dashed ring (the
 * geofence) on a green gradient tile — "geofenced scouting" in one glyph.
 * `LogoMark` is the standalone tile; `Logo` adds the wordmark and has a
 * `tone` switch so it works on both light surfaces and the dark sidebar.
 */

export function LogoMark({ size = 36 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 48 48"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden
    >
      <defs>
        <linearGradient id="fs-tile" x1="0" y1="0" x2="48" y2="48">
          <stop offset="0" stopColor="#10b981" />
          <stop offset="1" stopColor="#065f46" />
        </linearGradient>
      </defs>
      <rect width="48" height="48" rx="11" fill="url(#fs-tile)" />
      {/* geofence ring */}
      <circle
        cx="24"
        cy="24"
        r="16.5"
        stroke="white"
        strokeOpacity="0.45"
        strokeWidth="1.6"
        strokeDasharray="3.2 3.6"
        strokeLinecap="round"
      />
      {/* five petals */}
      {[0, 72, 144, 216, 288].map((deg) => (
        <path
          key={deg}
          d="M24 11.5 C28 15.5 28.2 20.5 24 24 C19.8 20.5 20 15.5 24 11.5 Z"
          fill="white"
          fillOpacity="0.92"
          transform={`rotate(${deg} 24 24)`}
        />
      ))}
      {/* bloom center */}
      <circle cx="24" cy="24" r="3.1" fill="#065f46" stroke="white" strokeWidth="1.4" />
    </svg>
  );
}

export function Logo({
  size = 36,
  tone = "dark",
}: {
  size?: number;
  /** "dark" = dark text (light surfaces) · "light" = white text (dark surfaces) */
  tone?: "dark" | "light";
}) {
  const name = tone === "light" ? "text-white" : "text-ink";
  const sub = tone === "light" ? "text-white/60" : "text-ink-faint";
  return (
    <div className="flex items-center gap-2.5">
      <LogoMark size={size} />
      <div className="leading-tight">
        <p className={`text-sm font-bold ${name}`}>
          Flori<span className="text-brand-400">Synergy</span>
        </p>
        <p className={`text-[11px] font-medium uppercase tracking-[0.14em] ${sub}`}>
          Scouting
        </p>
      </div>
    </div>
  );
}
