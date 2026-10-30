import type { ReactNode } from "react";

import { cn } from "../../lib/utils";

interface SettingsSection {
  title: string;
  description?: string;
  content: ReactNode;
}

interface SettingsFormProps {
  sections: SettingsSection[];
  /** Rendered below the last section (e.g. the save action). */
  footer?: ReactNode;
  className?: string;
}

/** Unframed settings layout: each section's title/description on the left,
 *  its controls on the right (stacked on narrow screens), hairline between. */
export function SettingsForm({ sections, footer, className }: SettingsFormProps) {
  return (
    <div className={cn("divide-y divide-border border-t border-border", className)}>
      {sections.map((section) => (
        <section key={section.title} className="grid gap-4 py-6 md:grid-cols-[minmax(0,1fr)_minmax(0,2fr)] md:gap-8">
          <div>
            <h2 className="text-base font-semibold text-foreground">{section.title}</h2>
            {section.description && (
              <p className="mt-0.5 text-sm text-muted-foreground">{section.description}</p>
            )}
          </div>
          <div className="min-w-0 space-y-4">{section.content}</div>
        </section>
      ))}
      {footer && <div className="flex justify-end py-4">{footer}</div>}
    </div>
  );
}
