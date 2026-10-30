import { useEffect, useRef, useState } from "react";
import type * as React from "react";
import { Button } from "./ui/button";
import { useIsMobile } from "../hooks/use-mobile";
import { useKeyboardInset } from "../hooks/useKeyboardInset";
import { cn } from "../lib/utils";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "./ui/dialog";
import { Input } from "./ui/input";
import { Label } from "./ui/label";
import { Textarea } from "./ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "./ui/select";
import { vocabularyLabel } from "../lib/vocabularies";
import { RequiredMark } from "./ui/required-mark";

export interface FormField {
  name: string;
  label: string;
  kind: "text" | "number" | "date" | "select" | "textarea";
  options?: string[];
  /** Display text per option value; defaults to the vocabulary label. */
  optionLabels?: Record<string, string>;
  /** Shown in an empty select, e.g. "Choose a site first". */
  emptyHint?: string;
  disabled?: boolean;
  required?: boolean;
  step?: string;
  min?: string;
  max?: string;
  placeholder?: string;
  span?: 1 | 2;
  /** A small control beside the label, e.g. "Nearest site". */
  labelAction?: React.ReactNode;
}

interface RecordFormDialogProps {
  open: boolean;
  title: string;
  description?: string;
  fields: FormField[];
  values: Record<string, string>;
  onChange: (name: string, value: string) => void;
  onClose: () => void;
  onSubmit: () => void;
  loading?: boolean;
  /** Extra form content after the generic fields (e.g. the site location
   *  editor). */
  children?: React.ReactNode;
  /** Dialog width class; defaults to `sm:max-w-lg`. */
  contentClassName?: string;
}

/** Modal form for creating/editing records. Radix Dialog provides the
 *  overlay, focus trap, Escape and focus restore. */
export function RecordFormDialog({
  open,
  title,
  description,
  fields,
  values,
  onChange,
  onClose,
  onSubmit,
  loading = false,
  children,
  contentClassName = "sm:max-w-lg",
}: RecordFormDialogProps) {
  const isMobile = useIsMobile();
  const keyboard = useKeyboardInset(open && isMobile);
  // Required fields say so next to the field, not in the browser's own transient bubble.
  const formRef = useRef<HTMLFormElement>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  useEffect(() => {
    if (!open) setErrors({});
  }, [open]);
  const change = (name: string, value: string) => {
    if (errors[name]) setErrors(({ [name]: _cleared, ...rest }) => rest);
    onChange(name, value);
  };
  const submit = () => {
    const missing = fields.filter((f) => f.required && !f.disabled && !(values[f.name] ?? "").trim());
    if (missing.length > 0) {
      setErrors(Object.fromEntries(missing.map((f) => [f.name, `${f.label} is required`])));
      document.getElementById(`rf-${missing[0].name}`)?.focus();
      return;
    }
    // Everything else (number ranges, formats) keeps the browser's own check.
    if (formRef.current && !formRef.current.checkValidity()) {
      formRef.current.reportValidity();
      return;
    }
    setErrors({});
    onSubmit();
  };
  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent
        // Header and footer stay put while the fields scroll, so Save is
        // always in reach. Below `md` it's a bottom sheet that rides above
        // the on-screen keyboard.
        className={cn(
          "flex max-h-[92dvh] flex-col gap-0 overflow-hidden p-0",
          "max-md:top-auto max-md:bottom-[var(--kb)] max-md:left-0 max-md:max-h-[calc(92dvh-var(--kb))] max-md:max-w-none max-md:translate-x-0 max-md:translate-y-0 max-md:rounded-b-none max-md:data-open:zoom-in-100 max-md:data-open:slide-in-from-bottom-10",
          contentClassName,
        )}
        style={{ "--kb": `${keyboard}px` } as React.CSSProperties}
        onEscapeKeyDown={(e) => {
          // Esc on an open autocomplete closes just its list, not the dialog
          // (and the half-filled form with it).
          const el = document.activeElement;
          if (el?.getAttribute("role") === "combobox" && el.getAttribute("aria-expanded") === "true") {
            e.preventDefault();
          }
        }}
      >
        <form
          ref={formRef}
          noValidate
          className="flex min-h-0 flex-1 flex-col"
          onSubmit={(e) => {
            e.preventDefault();
            submit();
          }}
        >
          <DialogHeader className="px-6 pt-6 pb-4 pr-12">
            <DialogTitle>{title}</DialogTitle>
            {description && <DialogDescription>{description}</DialogDescription>}
          </DialogHeader>
          <div className="flex min-h-0 flex-1 flex-col gap-6 overflow-y-auto px-6 pb-6">
            <div className="grid gap-(--card-gap) sm:grid-cols-2">
              {fields.map((f) => {
                const id = `rf-${f.name}`;
                return (
                  <div
                    key={f.name}
                    className={`space-y-(--field-gap) ${f.span === 2 || f.kind === "textarea" ? "sm:col-span-2" : ""}`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <Label htmlFor={id}>
                        {f.label}
                        {f.required && <RequiredMark />}
                      </Label>
                      {f.labelAction}
                    </div>
                    {f.kind === "textarea" ? (
                      <Textarea
                        id={id}
                        className="min-h-20"
                        value={values[f.name] ?? ""}
                        required={f.required}
                        aria-invalid={errors[f.name] ? true : undefined}
                        aria-describedby={errors[f.name] ? `${id}-error` : undefined}
                        placeholder={f.placeholder}
                        onChange={(e) => change(f.name, e.target.value)}
                      />
                    ) : f.kind === "select" ? (
                      <Select
                        value={values[f.name] ?? ""}
                        required={f.required}
                        disabled={f.disabled}
                        onValueChange={(v) => change(f.name, v)}
                      >
                        <SelectTrigger
                          id={id}
                          className="w-full"
                          aria-invalid={errors[f.name] ? true : undefined}
                          aria-describedby={errors[f.name] ? `${id}-error` : undefined}
                        >
                          <SelectValue placeholder={f.emptyHint ?? "Select…"} />
                        </SelectTrigger>
                        <SelectContent>
                          {(f.options ?? []).map((opt) => (
                            <SelectItem key={opt} value={opt}>
                              {f.optionLabels?.[opt] ?? vocabularyLabel(opt)}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    ) : (
                      <Input
                        id={id}
                        type={f.kind === "number" ? "number" : f.kind}
                        step={f.step}
                        min={f.min}
                        max={f.max}
                        className={f.kind === "number" ? "tnum" : undefined}
                        value={values[f.name] ?? ""}
                        required={f.required}
                        aria-invalid={errors[f.name] ? true : undefined}
                        aria-describedby={errors[f.name] ? `${id}-error` : undefined}
                        placeholder={f.placeholder}
                        onChange={(e) => change(f.name, e.target.value)}
                      />
                    )}
                    {errors[f.name] && (
                      <p id={`${id}-error`} className="text-xs text-destructive">
                        {errors[f.name]}
                      </p>
                    )}
                  </div>
                );
              })}
            </div>
            {children}
          </div>
          <DialogFooter className="border-t border-border px-6 py-4 max-md:pb-[max(1rem,env(safe-area-inset-bottom))]">
            <Button type="button" variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" disabled={loading}>
              {loading ? "Saving…" : "Save"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
