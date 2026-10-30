import { Link } from "react-router-dom";
import { ArrowRight, ChevronRight, ClipboardList, Plus } from "lucide-react";

import { DetailsCard } from "./DetailsCard";
import { Button } from "./ui/button";
import { Skeleton } from "./ui/skeleton";
import { useAllSurveys } from "../hooks/useSurveys";
import { formatDate } from "../lib/format";
import { vocabularyLabel } from "../lib/vocabularies";
import { LoadError } from "./LoadError";

/** The site page's summary: the state of the site at a glance, from the
 *  same query as the Surveys tab (so they share a cache). On a phone it is a
 *  single tappable line; from `sm` up it is the full card. */
export function SiteAtAGlance({
  siteId,
  onShowSurveys,
  onAddSurvey,
  canEdit,
}: {
  siteId: string;
  onShowSurveys: () => void;
  onAddSurvey: () => void;
  canEdit: boolean;
}) {
  const surveys = useAllSurveys({ siteId });

  if (surveys.isPending) {
    return (
      <>
        <div className="hidden sm:block">
          <DetailsCard title="At a glance">
            <Skeleton className="h-24 w-full" />
          </DetailsCard>
        </div>
        <Skeleton className="h-14 rounded-lg sm:hidden" />
      </>
    );
  }

  if (surveys.isError) {
    return <LoadError error={surveys.error} what="survey summary" onRetry={() => void surveys.refetch()} />;
  }

  const surveyList = [...(surveys.data?.items ?? [])].sort((a, b) =>
    b.survey_date.localeCompare(a.survey_date),
  );
  const latest = surveyList[0];
  const count = surveyList.length;

  return (
    <>
      {/* Phone: one tappable line. Add survey is already at the top of the page and in the bottom bar. */}
      <button
        type="button"
        onClick={onShowSurveys}
        className="flex min-h-11 w-full items-center gap-3 rounded-lg border border-border bg-card p-3 text-left text-dense shadow-sm transition-colors hover:bg-muted active:bg-muted sm:hidden"
      >
        <ClipboardList aria-hidden className="size-4 shrink-0 text-muted-foreground" />
        <span className="min-w-0 flex-1">
          <span className="font-medium text-foreground tnum">
            {count} {count === 1 ? "survey" : "surveys"}
          </span>
          <span className="text-muted-foreground">
            {latest ? ` · Latest ${formatDate(latest.survey_date)}, ${vocabularyLabel(latest.status)}` : " · None yet"}
          </span>
        </span>
        <ChevronRight aria-hidden className="size-4 shrink-0 text-muted-foreground" />
      </button>
      <div className="hidden sm:block">
        <DetailsCard
          title="At a glance"
          rows={[
            { label: "Surveys", value: <span className="tnum">{count}</span> },
            {
              label: "Latest survey",
              value: latest ? (
                <Link to={`/surveys/${latest.id}`} className="hover:text-primary hover:underline tap-area">
                  {formatDate(latest.survey_date)} · {latest.surveyor}{" "}
                  <span className="text-muted-foreground">({vocabularyLabel(latest.status)})</span>
                </Link>
              ) : (
                <span className="text-muted-foreground">None yet</span>
              ),
            },
          ]}
        >
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" size="sm" onClick={onShowSurveys}>
              Surveys
              <ArrowRight />
            </Button>
            {canEdit && (
              <Button variant="outline" size="sm" onClick={onAddSurvey}>
                <Plus />
                Add survey
              </Button>
            )}
          </div>
        </DetailsCard>
      </div>
    </>
  );
}
