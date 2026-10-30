import { useEffect, useState } from "react";
import { Check, LogOut } from "lucide-react";

import { useAuth } from "../hooks/useAuth";
import { PageHeader } from "../components/PageHeader";
import { PanelCard } from "../components/PanelCard";
import { ChangePasswordForm } from "../components/ChangePasswordForm";
import { Badge } from "../components/ui/badge";
import { Button } from "../components/ui/button";
import { Card, CardContent } from "../components/ui/card";
import { Input } from "../components/ui/input";
import { Label } from "../components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "../components/ui/select";
import { useRegisterHelpTopics } from "../help/useRegisterHelpTopics";
import { PROFILE_HELP_TOPICS } from "../help/pageTopics";
import { loadPrefs, savePrefs, type Density } from "../lib/prefs";
import { TableDisplaySettings } from "../components/TableDisplaySettings";
import { vocabularyLabel } from "../lib/vocabularies";
import { SettingRow } from "../components/SettingRow";
import { Segmented } from "../components/ui/segmented";
import { WithTooltip } from "../components/ui/with-tooltip";
import { SETTINGS_COLUMNS } from "../components/SettingsLayout";

const PAGE_OPTIONS = [
  { value: "/", label: "Dashboard" },
  { value: "/sites", label: "Sites" },
  { value: "/map", label: "Map" },
];

const DENSITY_OPTIONS: { value: Density; label: string }[] = [
  { value: "compact", label: "Compact" },
  { value: "comfortable", label: "Comfortable" },
];

/** What each role can do, in the words people use. */
const ROLE_CAN: Record<string, string> = {
  viewer: "View everything and add comments.",
  editor: "Record and edit sites and surveys, and comment.",
  admin: "Everything, including deleting records and managing users and settings.",
};

function initialsFor(name: string, email: string | null | undefined): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  if (words.length >= 2) return (words[0][0] + words[words.length - 1][0]).toUpperCase();
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase();
  return email ? email.split("@")[0].slice(0, 2).toUpperCase() : "?";
}

/** Profile: who you are, what you can do and your password (left); your
 *  preferences and how the app looks on this device (right). Two columns on a wide screen, one on a phone. */
export function ProfilePage() {
  const { email, role, multiUser, logout } = useAuth();
  useRegisterHelpTopics(PROFILE_HELP_TOPICS);
  const [displayName, setDisplayName] = useState("");
  const [defaultPage, setDefaultPage] = useState("/");
  const [density, setDensity] = useState<Density>(() => loadPrefs().density);
  const [saved, setSaved] = useState({ displayName: "", defaultPage: "/" });
  const [justSaved, setJustSaved] = useState(false);

  useEffect(() => {
    const prefs = loadPrefs();
    const initial = { displayName: prefs.displayName ?? "", defaultPage: prefs.defaultPage ?? "/" };
    setDisplayName(initial.displayName);
    setDefaultPage(initial.defaultPage);
    setSaved(initial);
  }, []);

  // Preferences save themselves: the landing page as soon as it changes, the display name when you
  // leave the field or press Enter. Nothing is saved when nothing changed.
  function persist(next: { displayName: string; defaultPage: string }) {
    if (next.displayName === saved.displayName && next.defaultPage === saved.defaultPage) return;
    // Keep settings saved elsewhere on the page (density).
    savePrefs({ ...loadPrefs(), ...next });
    setSaved(next);
    setJustSaved(true);
    window.setTimeout(() => setJustSaved(false), 2500);
  }

  const shownName = saved.displayName || email || "";

  return (
    <>
      <PageHeader
        title="Profile"
        actions={
          <Button type="button" variant="outline" size="sm" onClick={() => void logout()}>
            <LogOut />
            Sign out
          </Button>
        }
      />

      <div className={SETTINGS_COLUMNS}>
          <Card>
            {/* A row, not CardContent's default column: avatar beside the name and email. */}
            <CardContent className="flex-row items-center gap-3">
              <div
                aria-hidden
                className="grid size-10 shrink-0 place-items-center rounded-full bg-primary text-sm font-semibold text-primary-foreground"
              >
                {initialsFor(saved.displayName, email)}
              </div>
              <div className="min-w-0">
                <p className="truncate text-sm leading-5 font-semibold text-foreground">{shownName}</p>
                {saved.displayName && email && <p className="truncate text-dense text-muted-foreground">{email}</p>}
              </div>
              {/* The role is the fact; what it allows is a hover away. */}
              <WithTooltip label={ROLE_CAN[role ?? ""] ?? "No access"}>
                <Badge variant="secondary" tabIndex={0} className="ml-auto shrink-0">
                  {vocabularyLabel(role)}
                </Badge>
              </WithTooltip>
            </CardContent>
          </Card>

          {/* Single-user mode has only the bootstrap admin, whose password
              lives in .env. */}
          {multiUser && (
            <PanelCard title="Password" description="Signs you out on your other devices.">
              <ChangePasswordForm />
            </PanelCard>
          )}
          <PanelCard
            title="Preferences"
            // Always in the page, so the change is announced; empty (and so space-free) until something saves.
            action={
              <span role="status" className="flex items-center gap-1 text-xs text-success-fg">
                {justSaved && (
                  <>
                    <Check className="size-4" />
                    Saved
                  </>
                )}
              </span>
            }
          >
            <form
              className="grid gap-(--card-gap)"
              onSubmit={(e) => {
                e.preventDefault();
                persist({ displayName, defaultPage });
              }}
            >
              <div className="space-y-(--field-gap)">
                <Label htmlFor="display-name">Display name</Label>
                <Input
                  id="display-name"
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                  onBlur={() => persist({ displayName, defaultPage })}
                  placeholder="Shown instead of your email"
                />
              </div>
              <div className="space-y-(--field-gap)">
                <Label htmlFor="landing-page">Landing page</Label>
                <Select
                  value={defaultPage}
                  onValueChange={(value) => {
                    setDefaultPage(value);
                    persist({ displayName, defaultPage: value });
                  }}
                >
                  <SelectTrigger id="landing-page" className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {PAGE_OPTIONS.map((o) => (
                      <SelectItem key={o.value} value={o.value}>
                        {o.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </form>
          </PanelCard>
          <PanelCard title="Display">
            <div className="divide-y divide-border">
              <SettingRow label="Density" labelId="density-label">
                <Segmented
                  labelId="density-label"
                  options={DENSITY_OPTIONS}
                  value={density}
                  onChange={(next) => {
                    setDensity(next);
                    // A view setting: preview and persist immediately,
                    // keeping the other saved preferences as they are.
                    savePrefs({ ...loadPrefs(), density: next });
                  }}
                />
              </SettingRow>
            </div>
          </PanelCard>
          <PanelCard title="Tables">
            <div className="divide-y divide-border">
              <TableDisplaySettings />
            </div>
          </PanelCard>
      </div>
    </>
  );
}
