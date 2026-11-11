import { useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { ClipboardCheck, ClipboardPen, Pencil, Trash2, User } from "lucide-react";

import { useDeleteSurvey, useSurvey, useUpdateSurvey } from "../hooks/useSurveys";
import { useCan } from "../hooks/useCan";
import { PageHeader } from "../components/PageHeader";
import { PendingBadge } from "../components/PendingBadge";
import { StatusBadge } from "../components/StatusBadge";
import { SurveyFormDialog } from "../components/SurveyFormDialog";
import { DeleteConfirmDialog } from "../components/DeleteConfirmDialog";
import { CommentsTab } from "../components/CommentsTab";
import { AttachmentsTab } from "../components/AttachmentsTab";
import { ChangelogTab, fetchChangelog } from "../components/ChangelogTab";
import { DetailPageActions } from "../components/DetailPageActions";
import { PanelCard } from "../components/PanelCard";
import { DetailsCard } from "../components/DetailsCard";
import { RelativeTime } from "../components/RelativeTime";
import { LoadError } from "../components/LoadError";
import { Alert } from "../components/ui/alert";
import { Skeleton } from "../components/ui/skeleton";
import { Tabs, TabsContent, TabsTrigger } from "../components/ui/tabs";
import { formatDate } from "../lib/format";
import { vocabularyLabel } from "../lib/vocabularies";
import { Button } from "../components/ui/button";
import { RecordTabsList } from "../components/RecordTabsList";
import { ListSkeleton } from "../components/ui/list-skeleton";

/** One survey (a visit to a site): its discussion, files and history, with
 *  the facts in a Details card. */
export function SurveyDetailPage() {
  const { surveyId = "" } = useParams<{ surveyId: string }>();
  const navigate = useNavigate();
  const can = useCan();
  const { data: survey, isPending, isError, refetch } = useSurvey(surveyId);
  const updateSurvey = useUpdateSurvey();
  const deleteSurvey = useDeleteSurvey();
  const history = useQuery({
    queryKey: ["changelog", "survey", surveyId, survey?.updated_at],
    queryFn: () => fetchChangelog("survey", surveyId),
    enabled: Boolean(surveyId),
  });

  const [editOpen, setEditOpen] = useState(false);
  const [tab, setTab] = useState("overview");
  const [confirmDelete, setConfirmDelete] = useState(false);

  if (isPending) {
    return (
      <div className="flex flex-col gap-(--page-gap)">
        <div className="flex flex-col gap-3">
          <Skeleton className="h-4 w-48" />
          <Skeleton className="h-7 w-72 md:h-8" />
          <Skeleton className="h-4 w-full max-w-64" />
        </div>
        <Skeleton className="h-64 rounded-lg" />
      </div>
    );
  }
  if (isError || !survey) {
    return (
      <>
        <PageHeader
          title="Survey not found"
          breadcrumbs={[{ label: "Surveys", to: "/surveys" }, { label: "Not found" }]}
        />
        <Alert variant="destructive" className="items-center">
          <span>Could not load this survey. It may have been deleted.</span>
          <Button type="button" variant="outline" size="sm" className="ml-auto" onClick={() => void refetch()}>
            Try again
          </Button>
        </Alert>
      </>
    );
  }

  const siteHref = `/sites/${survey.site_id}`;
  const date = formatDate(survey.survey_date);
  const isDraft = survey.status === "draft";

  const details = (
    <DetailsCard
      rows={[
        {
          label: "Site",
          value: (
            <Link to={siteHref} className="hover:text-primary hover:underline tap-area">
              {survey.site_name ?? "Site"}
            </Link>
          ),
        },
        { label: "Date", value: date },
        { label: "Surveyor", value: survey.surveyor },
        {
          label: "Status",
          value: <StatusBadge value={survey.status} kind="survey" label={vocabularyLabel(survey.status)} />,
        },
        { label: "Recorded", value: formatDate(survey.created_at) },
        { label: "Updated", value: <RelativeTime value={survey.updated_at} /> },
      ]}
    />
  );

  return (
    <>
      <PageHeader
        kind="Survey"
        title={`Survey · ${date}`}
        breadcrumbs={[
          { label: "Sites", to: "/sites" },
          { label: survey.site_name ?? "Site", to: siteHref },
          { label: `Survey ${date}` },
        ]}
        badge={
          <>
            <StatusBadge value={survey.status} kind="survey" label={vocabularyLabel(survey.status)} />
            <PendingBadge record={survey} />
          </>
        }
        meta={
          <span className="flex items-center gap-2">
            <User className="size-3.5" />
            {survey.surveyor}
          </span>
        }
        actions={
          can.edit && (
            <DetailPageActions
              actions={[
                { label: "Edit survey", icon: <Pencil />, primary: true, phoneIconOnly: true, onClick: () => setEditOpen(true) },
              ]}
              menu={[
                {
                  label: isDraft ? "Mark completed" : "Reopen as draft",
                  icon: isDraft ? <ClipboardCheck /> : <ClipboardPen />,
                  disabled: updateSurvey.isPending,
                  onClick: () =>
                    updateSurvey.mutate({
                      id: survey.id,
                      body: { status: isDraft ? "completed" : "draft" },
                    }),
                },
                ...(can.remove
                  ? [
                      {
                        label: "Delete survey",
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

      <Tabs value={tab} onValueChange={setTab} className="gap-(--page-gap)">
        <RecordTabsList value={tab}>
          <TabsTrigger value="overview" className="flex-none">
            Overview
          </TabsTrigger>
          <TabsTrigger value="comments" className="flex-none">
            Comments
          </TabsTrigger>
          <TabsTrigger value="attachments" className="flex-none">
            Attachments
          </TabsTrigger>
          <TabsTrigger value="history" className="flex-none">
            History
          </TabsTrigger>
        </RecordTabsList>

        <TabsContent value="overview">
          {/* The facts and the write-up, like the site's Overview. */}
          <div className="grid items-start gap-(--page-gap) lg:grid-cols-2">
            {details}
            {survey.summary && (
              <PanelCard title="Summary">
                <p className="whitespace-pre-line text-sm text-foreground">{survey.summary}</p>
              </PanelCard>
            )}
          </div>
        </TabsContent>

          <TabsContent value="comments">
            <CommentsTab entity="survey" entityId={survey.id} />
          </TabsContent>
          <TabsContent value="attachments">
            <AttachmentsTab entity="survey" entityId={survey.id} />
          </TabsContent>
          <TabsContent value="history">
            {history.isPending ? (
              <ListSkeleton />
            ) : history.isError ? (
              <LoadError error={history.error} what="history" onRetry={() => void history.refetch()} />
            ) : (
              <ChangelogTab entries={history.data?.items ?? []} />
            )}
          </TabsContent>
      </Tabs>

      <SurveyFormDialog open={editOpen} survey={survey} onClose={() => setEditOpen(false)} />
      <DeleteConfirmDialog
        open={confirmDelete}
        onClose={() => setConfirmDelete(false)}
        onConfirm={() => deleteSurvey.mutate(survey.id, { onSuccess: () => navigate(siteHref) })}
        name={`Survey of ${date}`}
        entityLabel="survey"
        recoverable
        loading={deleteSurvey.isPending}
      />
    </>
  );
}
