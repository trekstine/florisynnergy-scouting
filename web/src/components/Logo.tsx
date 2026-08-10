import Image from "next/image";

/**
 * FloriSynergy IPM brand mark — the official logo asset, shared with the
 * mobile app so both surfaces carry identical branding.
 */

export function LogoMark({ size = 36 }: { size?: number }) {
  return (
    <Image
      src="/logo.png"
      alt=""
      width={size}
      height={size}
      priority
      className="object-contain"
      aria-hidden
    />
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
          IPM
        </p>
      </div>
    </div>
  );
}
