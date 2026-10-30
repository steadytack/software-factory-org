import type { ReactNode } from "react";

import { cn } from "../../lib/utils";

interface AuthSplitProps {
  /** Left brand panel content (logo, headline, bullets). */
  brand: ReactNode;
  /** Right form panel content. */
  form: ReactNode;
  /** Reverse panel order on large screens. */
  reverse?: boolean;
  className?: string;
}

/**
 * Split-screen auth layout (ReUI auth block pattern): brand panel on the
 * left, form panel on the right; stacks vertically on small screens.
 */
export function AuthSplit({ brand, form, className }: AuthSplitProps) {
  return (
    <div className={cn("grid min-h-screen lg:grid-cols-2", className)}>
      <div className="brand-panel relative hidden flex-col justify-between overflow-hidden p-12 lg:flex">
        {brand}
      </div>
      <div className="flex items-center justify-center bg-background p-6">
        <div className="w-full max-w-sm">{form}</div>
      </div>
    </div>
  );
}
