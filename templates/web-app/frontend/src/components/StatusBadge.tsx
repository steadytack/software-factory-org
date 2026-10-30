import { Badge } from "./ui/badge";
import { cn } from "../lib/utils";
import { vocabularyLabel } from "../lib/vocabularies";
import {
  siteStatusTone,
  surveyStatusTone,
  toneClass,
  type ChipTone,
} from "../lib/chips";

const TONE_RESOLVERS = {
  site: siteStatusTone,
  survey: surveyStatusTone,
} as const;

interface StatusBadgeProps {
  value: string;
  /** Which vocabulary `value` belongs to; picks the tone. Ignored when `tone` is set. */
  kind?: keyof typeof TONE_RESOLVERS;
  tone?: ChipTone;
  /** Display text; defaults to the vocabulary label (sentence case: "In progress", "Not assessed"). */
  label?: string;
  className?: string;
}

/** The one way to show a status/severity: same shape, dot and colour on every page. */
export function StatusBadge({ value, kind = "site", tone, label, className }: StatusBadgeProps) {
  const resolved = tone ?? TONE_RESOLVERS[kind](value);
  return (
    <Badge variant="outline" className={cn(toneClass(resolved), className)}>
      <span aria-hidden className="size-1.5 rounded-full bg-current" />
      {label ?? vocabularyLabel(value)}
    </Badge>
  );
}
