import { useEffect, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useBlocker, useLocation, useNavigate, useParams } from "react-router-dom";
import { sitesListHref } from "../lib/listContext";
import { UnsavedChangesDialog } from "../components/UnsavedChangesDialog";
import { toast } from "sonner";
import { Archive, ArchiveRestore, ClipboardPlus, Clock, MapPin, Tag, Trash2 } from "lucide-react";
import { DetailPageActions } from "../components/DetailPageActions";
import { DetailLayout } from "../components/DetailLayout";
import { SectionCard } from "../components/DetailsCard";
import { SaveBar } from "../components/SaveBar";
import { SiteAtAGlance } from "../components/SiteAtAGlance";

import { useSite, useUpdateSite, useDeleteSite } from "../hooks/useSites";
import { useCan } from "../hooks/useCan";
import { useAllSurveys } from "../hooks/useSurveys";
import { fetchChangelog } from "../components/ChangelogTab";
import { ChangelogTab } from "../components/ChangelogTab";
import { CommentsTab } from "../components/CommentsTab";
import { AttachmentsTab } from "../components/AttachmentsTab";
import { DeleteConfirmDialog } from "../components/DeleteConfirmDialog";
import { LoadError } from "../components/LoadError";
import { Alert } from "../components/ui/alert";
import { Input } from "../components/ui/input";
import { Label } from "../components/ui/label";
import { Textarea } from "../components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "../components/ui/select";
import { Tabs, TabsContent, TabsTrigger } from "../components/ui/tabs";
import { PageHeader } from "../components/PageHeader";
import { RelativeTime } from "../components/RelativeTime";
import { Skeleton } from "../components/ui/skeleton";
import { type FormField } from "../components/RecordFormDialog";
import { SiteLocationFields } from "../components/SiteLocationFields";
import { SiteSurveysPanel } from "../components/SiteSurveysPanel";
import { SurveyFormDialog } from "../components/SurveyFormDialog";
import { registerSearchItem, unregisterSearchItem } from "../search/registry";
import {
  EMPTY_SITE_FORM,
  SITE_FORM_FIELDS,
  formToSitePayload,
  siteToForm,
  type SiteFormValues,
} from "../lib/siteForm";
import { PendingBadge } from "../components/PendingBadge";
import { StatusBadge } from "../components/StatusBadge";
import { formatCoordinate } from "../lib/format";
import { vocabularyLabel } from "../lib/vocabularies";
import { CountBadge } from "../components/ui/count-badge";
import { RequiredMark } from "../components/ui/required-mark";
import { Button } from "../components/ui/button";
import { RecordTabsList } from "../components/RecordTabsList";
import { ListSkeleton } from "../components/ui/list-skeleton";

const EDIT_FIELDS: FormField[] = SITE_FORM_FIELDS;

type Tab = "overview" | "surveys" | "comments" | "attachments" | "changelog";

export function SiteDetailPage() {
  const { siteId } = useParams<{ siteId: string }>();
  const navigate = useNavigate();
  const location = useLocation();
  // Back to the exact Sites view the user came from (filters, sort, page).
  const sitesHref = sitesListHref(location.state);
  const can = useCan();
  const { data: site, isPending, refetch } = useSite(siteId ?? "");
  const updateSite = useUpdateSite();
  const deleteSite = useDeleteSite();
  // Tab badge: the server total, not the loaded array's length.
  const { data: surveyList } = useAllSurveys({ siteId });
  const surveyTotal = surveyList?.total ?? 0;
  const [tab, setTab] = useState<Tab>("overview");
  const [form, setForm] = useState<SiteFormValues>(EMPTY_SITE_FORM);
  const [surveyOpen, setSurveyOpen] = useState(false);
  const [dirty, setDirty] = useState(false);
  // Changelog via react-query: refetches with the site, and failures are
  // surfaced instead of silently rendering an empty tab.
  const changelogQuery = useQuery({
    queryKey: ["changelog", "site", siteId, site?.updated_at],
    queryFn: () => fetchChangelog("site", siteId ?? ""),
    enabled: Boolean(siteId),
  });
  const changelog = changelogQuery.data?.items ?? [];
  const changelogTotal = changelogQuery.data?.total ?? 0;
  const [confirmDelete, setConfirmDelete] = useState(false);

  useEffect(() => {
    if (!site) return;
    setForm(siteToForm(site));
    setDirty(false);
  }, [site]);

  function save(onSaved?: () => void) {
    if (!siteId) return;
    // Coordinates are validated/converted from BNG here; an empty or
    // malformed value is rejected rather than defaulting to 0,0 (audit F6).
    const result = formToSitePayload(form);
    if (!result.ok) {
      toast.error(result.error);
      return;
    }
    updateSite.mutate(
      { id: siteId, body: result.body },
      {
        onSuccess: () => {
          setDirty(false);
          toast.success("Changes saved.");
          onSaved?.();
        },
      },
    );
  }

  function remove() {
    if (!siteId) return;
    deleteSite.mutate(siteId, {
      onSuccess: () => {
        // The record is gone; unsaved edits to it are moot.
        skipGuardRef.current = true;
        navigate(sitesHref);
      },
    });
  }

  // "Add survey…" in the Ctrl K palette while this site is open.
  useEffect(() => {
    if (!site || !can.edit) return;
    registerSearchItem({
      id: "action-add-survey",
      label: `Add survey to ${site.name}…`,
      group: "Actions",
      keywords: ["add survey", "new survey", "visit", "inspection"],
      action: () => setSurveyOpen(true),
    });
    return () => unregisterSearchItem("action-add-survey");
  }, [site, can.edit]);

  // ── Unsaved-changes guard: in-app navigation and tab close/reload ──
  const skipGuardRef = useRef(false);
  const blocker = useBlocker(
    ({ currentLocation, nextLocation }) =>
      dirty && !skipGuardRef.current && currentLocation.pathname !== nextLocation.pathname,
  );
  useEffect(() => {
    if (!dirty) return;
    const onBeforeUnload = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, [dirty]);

  // ── Ctrl/Cmd+S saves ──
  const saveRef = useRef(save);
  saveRef.current = save;
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (can.edit && (e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "s") {
        e.preventDefault();
        if (dirty && !updateSite.isPending) saveRef.current();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [dirty, updateSite.isPending, can.edit]);

  if (isPending) {
    return (
      <div className="flex flex-col gap-(--page-gap)">
        <div className="flex flex-col gap-3">
          <Skeleton className="h-4 w-32" />
          <Skeleton className="h-7 w-64 md:h-8" />
          <Skeleton className="h-4 w-full max-w-80" />
        </div>
        <div className="flex gap-4 overflow-hidden border-b border-border pb-2">
          <Skeleton className="h-5 w-16" />
          <Skeleton className="h-5 w-16" />
          <Skeleton className="h-5 w-20" />
          <Skeleton className="h-5 w-24" />
        </div>
        <Skeleton className="h-64 rounded-lg" />
      </div>
    );
  }
  if (!site)
    return (
      <>
        <PageHeader
          title="Site not found"
          breadcrumbs={[{ label: "Sites", to: sitesHref }, { label: "Not found" }]}
        />
        <Alert variant="destructive" className="items-center">
          <span>Could not load this site. It may have been deleted.</span>
          <Button type="button" variant="outline" size="sm" className="ml-auto" onClick={() => void refetch()}>
            Try again
          </Button>
        </Alert>
      </>
    );

  const setField = (name: string, value: string) => {
    setForm((prev) => ({ ...prev, [name]: value }));
    setDirty(true);
  };
  const renderField = (f: FormField, showLabel = true) => (
    <div
      key={f.name}
      className={`space-y-(--field-gap) ${f.kind === "textarea" ? "sm:col-span-2" : ""} ${f.name === "name" ? "col-span-2" : ""}`}
    >
      <Label htmlFor={`field-${f.name}`} className={showLabel ? undefined : "sr-only"}>
        {f.label}
        {f.required && <RequiredMark />}
      </Label>
      {f.kind === "textarea" ? (
        <Textarea
          id={`field-${f.name}`}
          className="min-h-24"
          value={form[f.name as keyof SiteFormValues] ?? ""}
          onChange={(e) => setField(f.name, e.target.value)}
        />
      ) : f.kind === "select" ? (
        <Select
          value={form[f.name as keyof SiteFormValues] ?? ""}
          onValueChange={(v) => setField(f.name, v)}
        >
          <SelectTrigger id={`field-${f.name}`} className="w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {(f.options ?? []).map((o: string) => (
              <SelectItem key={o} value={o}>
                {vocabularyLabel(o)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      ) : (
        <Input
          id={`field-${f.name}`}
          type={f.kind}
          value={form[f.name as keyof SiteFormValues] ?? ""}
          onChange={(e) => setField(f.name, e.target.value)}
        />
      )}
    </div>
  );

  return (
    <div className="flex flex-col gap-(--page-gap)">
      <PageHeader
        kind="Site"
        title={site.name}
        breadcrumbs={[{ label: "Sites", to: sitesHref }, { label: site.name }]}
        badge={
          <>
            <StatusBadge value={site.status} kind="site" label={vocabularyLabel(site.status)} />
            <PendingBadge record={site} />
            {/* Beside the title, not in the action row, so buttons don't jump. */}
            {dirty && <StatusBadge value="unsaved" tone="warning" label="Unsaved changes" />}
          </>
        }
        meta={
          <>
            <span className="flex items-center gap-2">
              <Tag className="size-3.5" />
              {vocabularyLabel(site.site_type)}
            </span>
            <span aria-hidden className="hidden sm:inline">·</span>
            {/* The address and postcode are in the form below; on a phone the header keeps to the essentials. */}
            <span className="hidden items-center gap-2 sm:flex">
              <MapPin className="size-3.5" />
              {[site.address, site.postcode].filter(Boolean).join(", ") || (
                <span className="tnum">
                  {formatCoordinate(site.latitude)}, {formatCoordinate(site.longitude)}
                </span>
              )}
            </span>
            <span aria-hidden className="hidden sm:inline">·</span>
            <span className="hidden items-center gap-2 sm:flex">
              <Clock className="size-3.5" />
              <span>
                Updated <RelativeTime value={site.updated_at} />
              </span>
            </span>
          </>
        }
        actions={
          can.edit && (
            <DetailPageActions
              actions={[
                {
                  label: "Add survey",
                  icon: <ClipboardPlus />,
                  primary: true,
                  // The bottom bar's + adds a survey to the site you are viewing.
                  phoneHidden: true,
                  onClick: () => setSurveyOpen(true),
                },
              ]}
              menu={[
                {
                  label: site.status === "archived" ? "Restore site" : "Archive site",
                  icon: site.status === "archived" ? <ArchiveRestore /> : <Archive />,
                  // Archiving saves the site, so it waits for other edits.
                  disabled: dirty || updateSite.isPending,
                  onClick: () => {
                    const status = site.status === "archived" ? "active" : "archived";
                    updateSite.mutate(
                      { id: site.id, body: { status } },
                      {
                        onSuccess: () =>
                          toast.success(status === "archived" ? "Site archived." : "Site restored."),
                      },
                    );
                  },
                },
                ...(can.remove
                  ? [
                      {
                        label: "Delete site",
                        icon: <Trash2 />,
                        destructive: true,
                        onClick: () => setConfirmDelete(true),
                      },
                    ]
                  : []),
              ]}
            />
          )
        }
      />

      <Tabs value={tab} onValueChange={(v) => setTab(v as Tab)} className="gap-(--page-gap)">
        <RecordTabsList value={tab}>
          <TabsTrigger value="overview" className="flex-none">
            Overview
          </TabsTrigger>
          <TabsTrigger value="surveys" className="flex-none">
            Surveys
            {surveyTotal ? <CountBadge n={surveyTotal} /> : null}
          </TabsTrigger>
          <TabsTrigger value="comments" className="flex-none">
            Comments
          </TabsTrigger>
          <TabsTrigger value="attachments" className="flex-none">
            Attachments
          </TabsTrigger>
          <TabsTrigger value="changelog" className="flex-none">
            History
            <CountBadge n={changelogTotal} />
          </TabsTrigger>
        </RecordTabsList>

        <TabsContent value="overview">
          <DetailLayout
            aside={
              <SiteAtAGlance
                siteId={site.id}
                canEdit={can.edit}
                onShowSurveys={() => setTab("surveys")}
                onAddSurvey={() => setSurveyOpen(true)}
              />
            }
          >
            {/* A disabled fieldset makes every control in the form read-only
              for viewers in one place. */}
            <fieldset disabled={!can.edit} className="flex min-w-0 flex-col gap-(--page-gap)">
              <SectionCard title="Details">
                <div className="grid grid-cols-2 gap-(--card-gap)">
                  {EDIT_FIELDS.filter((f) => f.kind !== "textarea").map((f) => renderField(f))}
                </div>
              </SectionCard>
              <SectionCard title="Location">
                <SiteLocationFields
                  idPrefix="site"
                  values={form}
                  onChange={(name, value) => setField(name, value)}
                  readOnly={!can.edit}
                  mapClassName="h-48 sm:h-72"
                />
              </SectionCard>
              <SectionCard title="Notes">
                {EDIT_FIELDS.filter((f) => f.kind === "textarea").map((f) => renderField(f, false))}
              </SectionCard>
            </fieldset>
          </DetailLayout>
        </TabsContent>

        <TabsContent value="surveys">
          <SiteSurveysPanel site={site} onAddSurvey={() => setSurveyOpen(true)} />
        </TabsContent>

        <TabsContent value="changelog">
          {changelogQuery.isPending ? (
            <ListSkeleton />
          ) : changelogQuery.isError ? (
            <LoadError error={changelogQuery.error} what="history" onRetry={() => void changelogQuery.refetch()} />
          ) : (
            <ChangelogTab entries={changelog} />
          )}
        </TabsContent>
        <TabsContent value="comments">
          <CommentsTab entity="site" entityId={site.id} />
        </TabsContent>
        <TabsContent value="attachments">
          <AttachmentsTab entity="site" entityId={site.id} />
        </TabsContent>
      </Tabs>

      <SaveBar
        dirty={can.edit && dirty}
        saving={updateSite.isPending}
        onSave={() => save()}
        onDiscard={() => {
          setForm(siteToForm(site));
          setDirty(false);
        }}
      />

      <SurveyFormDialog
        open={surveyOpen}
        siteId={site.id}
        siteName={site.name}
        onClose={() => setSurveyOpen(false)}
        onSaved={() => setTab("surveys")}
      />

      <DeleteConfirmDialog
        open={confirmDelete}
        onClose={() => setConfirmDelete(false)}
        onConfirm={remove}
        name={site.name}
        entityLabel="site"
        consequence="Its surveys, comments and files are deleted with it."
        loading={deleteSite.isPending}
      />

      <UnsavedChangesDialog
        open={blocker.state === "blocked"}
        saving={updateSite.isPending}
        onStay={() => blocker.reset?.()}
        onDiscard={() => blocker.proceed?.()}
        onSaveAndLeave={() => save(() => blocker.proceed?.())}
      />
    </div>
  );
}
