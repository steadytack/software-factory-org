import { useEffect, useMemo, useState } from "react";
import { Bug, ImageOff, Lightbulb, Loader2, MessageSquare, RefreshCw, Send } from "lucide-react";
import { toast } from "sonner";

import { api, expectData } from "../api/client";
import { useAuth } from "../hooks/useAuth";
import { collectDiagnostics, diagnosticsRows } from "../lib/diagnostics";
import { isQueued } from "../lib/outbox";
import { loadPrefs } from "../lib/prefs";
import { captureScreen } from "../lib/screenshot";
import { cn } from "../lib/utils";
import { Button } from "../components/ui/button";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "../components/ui/collapsible";
import { Input } from "../components/ui/input";
import { Label } from "../components/ui/label";
import { Switch } from "../components/ui/switch";
import { Textarea } from "../components/ui/textarea";

/** What the person picks. The stored `kind` keeps its original names (a problem is a
 *  `bug`, a suggestion an `idea`, a question `other`) so the backend is unchanged. */
type Kind = "bug" | "idea" | "other";

const KINDS: {
  value: Kind;
  label: string;
  icon: typeof Bug;
  placeholder: string;
  example: string;
}[] = [
  {
    value: "bug",
    label: "Problem",
    icon: Bug,
    placeholder: "What happened, what you expected, and the steps to make it happen again.",
    example: "e.g. Map export comes out blank",
  },
  {
    value: "idea",
    label: "Suggestion",
    icon: Lightbulb,
    placeholder: "What would you like it to do, and what would it help with?",
    example: "e.g. Filter surveys by surveyor",
  },
  {
    value: "other",
    label: "Question",
    icon: MessageSquare,
    placeholder: "What would you like to know?",
    example: "e.g. How do I archive a site?",
  },
];

const SUMMARY_MAX = 150;

/** Help & feedback: a problem, a suggestion or a question, sent to
 *  the team with a screenshot of the page and the diagnostics listed under
 *  "What's sent with it". Offline, it waits in the outbox. */
export function FeedbackForm({ onSent }: { onSent?: () => void }) {
  const { email, role, multiUser } = useAuth();
  const [kind, setKind] = useState<Kind>("bug");
  const [summary, setSummary] = useState("");
  const [details, setDetails] = useState("");
  const [shot, setShot] = useState<string | null>(null);
  const [shooting, setShooting] = useState(false);
  const [includeShot, setIncludeShot] = useState(true);
  const [sending, setSending] = useState(false);

  async function takeScreenshot() {
    setShooting(true);
    try {
      setShot(await captureScreen());
    } catch {
      setShot(null);
    } finally {
      setShooting(false);
    }
  }
  // The page behind the Help panel, as it is when the tab opens.
  useEffect(() => {
    void takeScreenshot();
  }, []);

  const diagnostics = useMemo(
    () => collectDiagnostics({ email: email ?? null, displayName: loadPrefs().displayName, role: role ?? "viewer", multiUser }),
    [email, role, multiUser],
  );
  const current = KINDS.find((k) => k.value === kind)!;

  async function send(e: React.FormEvent) {
    e.preventDefault();
    if (!summary.trim()) return;
    setSending(true);
    try {
      const result = await expectData(() =>
        api.POST("/api/feedback", {
          body: {
            kind,
            summary: summary.trim(),
            details: details.trim() || null,
            // Collected again at send time: the latest errors and state.
            context: collectDiagnostics({
              email: email ?? null,
              displayName: loadPrefs().displayName,
              role: role ?? "viewer",
              multiUser,
            }) as unknown as Record<string, never>,
            screenshot: includeShot ? shot : null,
          },
        }),
      );
      if (isQueued(result)) toast.success("Saved on this device — it will send when you're back online.");
      else toast.success(result.message);
      setSummary("");
      setDetails("");
      onSent?.();
    } catch {
      // The global error toast says what went wrong.
    } finally {
      setSending(false);
    }
  }

  return (
    <form onSubmit={send} className="flex flex-col gap-(--card-gap) p-4">
      <p className="text-sm text-muted-foreground">
        Report a problem, suggest an improvement or ask a question. It goes straight to the team.
      </p>

      <div role="radiogroup" aria-label="What's this about?" className="grid grid-cols-3 gap-2">
        {KINDS.map(({ value, label, icon: Icon }) => (
          <button
            key={value}
            type="button"
            role="radio"
            aria-checked={kind === value}
            onClick={() => setKind(value)}
            className={cn(
              "flex flex-col items-center gap-1 rounded-md border px-1 py-2 text-xs font-medium transition-colors",
              kind === value ? "border-primary bg-primary text-primary-foreground" : "border-border text-foreground/80 hover:bg-muted",
            )}
          >
            <Icon className="size-4" />
            {label}
          </button>
        ))}
      </div>

      <div className="space-y-(--field-gap)">
        <Label htmlFor="feedback-summary">Summary</Label>
        <Input
          id="feedback-summary"
          required
          maxLength={SUMMARY_MAX}
          value={summary}
          onChange={(e) => setSummary(e.target.value)}
          placeholder={current.example}
        />
      </div>
      <div className="space-y-(--field-gap)">
        <Label htmlFor="feedback-details">Details</Label>
        <Textarea
          id="feedback-details"
          rows={5}
          maxLength={5000}
          value={details}
          onChange={(e) => setDetails(e.target.value)}
          placeholder={current.placeholder}
        />
      </div>

      <div className="space-y-(--field-gap)">
        <div className="flex items-center justify-between gap-2">
          <Label htmlFor="feedback-shot" className="text-dense font-normal text-foreground">
            Include a screenshot
          </Label>
          <Switch id="feedback-shot" checked={includeShot} onCheckedChange={setIncludeShot} />
        </div>
        {includeShot && (
          <div className="flex items-start gap-3">
            <div className="grid aspect-video w-40 shrink-0 place-items-center overflow-hidden rounded-md border border-border bg-muted">
              {shooting ? (
                <Loader2 className="size-5 animate-spin text-muted-foreground" />
              ) : shot ? (
                <img src={shot} alt="Screenshot of the page" className="size-full object-cover object-top" />
              ) : (
                <ImageOff className="size-5 text-muted-foreground" />
              )}
            </div>
            <div className="space-y-3 text-xs text-muted-foreground">
              <p>{shot || shooting ? "Of the page behind this panel." : "Couldn't take one on this device."}</p>
              <p>Maps can come out blank.</p>
              <Button type="button" variant="outline" size="sm" disabled={shooting} onClick={() => void takeScreenshot()}>
                <RefreshCw />
                Retake
              </Button>
            </div>
          </div>
        )}
      </div>

      <Collapsible className="rounded-md border border-border">
        <CollapsibleTrigger className="w-full px-3 py-2 text-left text-sm font-medium text-foreground hover:bg-muted/50">
          What's sent with it
        </CollapsibleTrigger>
        <CollapsibleContent>
          <dl className="max-h-56 overflow-y-auto border-t border-border px-3 py-2 text-xs">
            {diagnosticsRows(diagnostics).map(([k, v]) => (
              <div key={k} className="grid grid-cols-[8.5rem_1fr] gap-2 py-0.5">
                <dt className="text-muted-foreground">{k}</dt>
                <dd className="whitespace-pre-wrap break-words text-foreground">{v}</dd>
              </div>
            ))}
          </dl>
        </CollapsibleContent>
      </Collapsible>

      <Button type="submit" className="w-full" disabled={sending || !summary.trim()}>
        {sending ? <Loader2 className="animate-spin" /> : <Send />}
        {sending ? "Sending…" : "Send"}
      </Button>
    </form>
  );
}
