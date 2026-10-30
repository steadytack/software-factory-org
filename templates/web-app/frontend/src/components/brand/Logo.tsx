import { BRAND } from "../../lib/brand";
import { cn } from "../../lib/utils";

interface LogoMarkProps {
  className?: string;
  /** Light tile with primary strokes — for use on a primary-coloured surface. */
  inverted?: boolean;
}

/** The app's mark: a survey pin above contour lines, on a rounded tile.
 *  Keep in sync with public/favicon.svg. */
export function LogoMark({ className, inverted = false }: LogoMarkProps) {
  // Inverted sits on the deep-ink brand panel in both themes, so it uses fixed colours.
  const tile = inverted ? "#ffffff" : "var(--primary)";
  const ink = inverted ? "#1556c0" : "var(--primary-foreground)";
  return (
    <svg
      viewBox="0 0 32 32"
      aria-hidden
      className={cn("size-8 shrink-0", className)}
    >
      <rect width="32" height="32" rx="8" fill={tile} />
      <path
        d="M5 22.5c3.5-2.6 7-2.6 10.5 0s7 2.6 11.5-.8"
        fill="none"
        stroke={ink}
        strokeWidth="2"
        strokeLinecap="round"
      />
      <path
        d="M5 27c3.5-2 7-2 10.5 0s7 2 11.5-.6"
        fill="none"
        stroke={ink}
        strokeOpacity="0.55"
        strokeWidth="2"
        strokeLinecap="round"
      />
      <path
        d="M16 4.5a5.2 5.2 0 0 0-5.2 5.2c0 3.8 5.2 8.8 5.2 8.8s5.2-5 5.2-8.8A5.2 5.2 0 0 0 16 4.5z"
        fill={ink}
      />
      <circle cx="16" cy="9.7" r="1.9" fill={tile} />
    </svg>
  );
}

/** Mark + wordmark. */
export function Logo({ className, inverted }: LogoMarkProps) {
  return (
    <span className={cn("flex items-center gap-3", className)}>
      <LogoMark inverted={inverted} />
      <span className="text-base font-semibold tracking-tight">{BRAND.name}</span>
    </span>
  );
}
