import Image from "next/image";

/**
 * The registered Florisynergy trademark.
 *
 * The artwork is used as supplied — proportions and elements are never
 * altered. Two variants only: the original two-colour version for light
 * surfaces, and a single-colour white knockout for dark ones, which is the
 * conventional reversed treatment. "IPM" is set as a separate product
 * descriptor beside the mark rather than being drawn into it, so the
 * trademark itself stays intact.
 */

/** Aspect ratios of the supplied artwork, so nothing gets squashed. */
const MARK_RATIO = 512 / 391;
const LOCKUP_RATIO = 900 / 416;

export function LogoMark({
  size = 36,
  tone = "dark",
}: {
  /** Rendered height in pixels. */
  size?: number;
  tone?: "dark" | "light";
}) {
  return (
    <Image
      src={tone === "light" ? "/brand/florisynergy-mark-white.png" : "/brand/florisynergy-mark.png"}
      alt=""
      width={Math.round(size * MARK_RATIO)}
      height={size}
      priority
      className="object-contain"
      aria-hidden
    />
  );
}

/**
 * The full lockup — symbol above wordmark. Use where the brand should read
 * as itself: the login screen and the header of every printed document.
 */
export function LogoLockup({
  width = 200,
  tone = "dark",
}: {
  width?: number;
  tone?: "dark" | "light";
}) {
  return (
    <Image
      src={tone === "light" ? "/brand/florisynergy-logo-white.png" : "/brand/florisynergy-logo.png"}
      alt="Florisynergy"
      width={width}
      height={Math.round(width / LOCKUP_RATIO)}
      priority
      className="object-contain"
    />
  );
}

/**
 * Compact horizontal lockup for the app chrome: the trademark symbol, then
 * the product name. Used in the sidebar, where vertical space is scarce.
 */
export function Logo({
  size = 34,
  tone = "dark",
}: {
  size?: number;
  /** "dark" = dark text (light surfaces) · "light" = white text (dark surfaces) */
  tone?: "dark" | "light";
}) {
  const name = tone === "light" ? "text-white" : "text-[#272262]";
  const sub = tone === "light" ? "text-white/60" : "text-ink-faint";
  return (
    <div className="flex items-center gap-2.5">
      <LogoMark size={size} tone={tone} />
      <div className="leading-tight">
        <p className={`text-[15px] font-bold tracking-tight ${name}`}>Florisynergy</p>
        <p className={`text-[11px] font-medium uppercase tracking-[0.16em] ${sub}`}>IPM</p>
      </div>
    </div>
  );
}
