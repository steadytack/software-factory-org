import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";

import { RecordFormDialog, type FormField } from "./RecordFormDialog";
import { useSiteLocations } from "../hooks/useSites";
import { NearestSiteButton } from "./NearestSiteButton";
import { useCreateSurvey, useUpdateSurvey } from "../hooks/useSurveys";
import { loadPrefs } from "../lib/prefs";
import { localIsoDate } from "../lib/format";
import { SURVEY_STATUSES, type SurveyStatus } from "../lib/vocabularies";
import type { components } from "../types/openapi";

type Survey = components["schemas"]["SurveyRead"];

interface SurveyFormDialogProps {
  open: boolean;
  onClose: () => void;
  /** Edit this survey; omit to create one. */
  survey?: Survey | null;
  /** Create for this site (no site picker); omit to let the user choose. */
  siteId?: string;
  siteName?: string;
  onSaved?: (survey: Survey) => void;
}

const todayIso = () => localIsoDate();

function initialValues(survey: Survey | null | undefined, siteId?: string): Record<string, string> {
  if (survey) {
    return {
      site_id: survey.site_id,
      surveyor: survey.surveyor,
      survey_date: survey.survey_date,
      status: survey.status,
      summary: survey.summary ?? "",
    };
  }
  return {
    site_id: siteId ?? "",
    surveyor: loadPrefs().displayName,
    survey_date: todayIso(),
    status: "draft",
    summary: "",
  };
}

/** Add or edit a survey — from a site's page (site fixed) or from the
 *  Surveys table (site chosen here). */
export function SurveyFormDialog({ open, onClose, survey, siteId, siteName, onSaved }: SurveyFormDialogProps) {
  const [values, setValues] = useState<Record<string, string>>(() => initialValues(survey, siteId));
  const createSurvey = useCreateSurvey();
  const updateSurvey = useUpdateSurvey();
  const pickSite = !survey && !siteId;
  const { data: sites } = useSiteLocations();

  // Fresh form each time the dialog opens (or switches record).
  useEffect(() => {
    if (open) setValues(initialValues(survey, siteId));
  }, [open, survey, siteId]);

  const fields = useMemo<FormField[]>(() => {
    const siteOptions = sites?.items ?? [];
    return [
      ...(pickSite
        ? [
            {
              name: "site_id",
              label: "Site",
              kind: "select",
              required: true,
              span: 2,
              options: siteOptions.map((s) => s.id),
              optionLabels: Object.fromEntries(siteOptions.map((s) => [s.id, s.name])),
              emptyHint: "Choose a site",
              labelAction: (
                <NearestSiteButton
                  sites={siteOptions}
                  onPick={(id) => setValues((v) => ({ ...v, site_id: id }))}
                />
              ),
            } satisfies FormField,
          ]
        : []),
      { name: "surveyor", label: "Surveyor", kind: "text", required: true, placeholder: "Who carried it out" },
      { name: "survey_date", label: "Date", kind: "date", required: true },
      { name: "status", label: "Status", kind: "select", options: [...SURVEY_STATUSES] },
      { name: "summary", label: "Summary", kind: "textarea", placeholder: "Optional summary of the visit" },
    ];
  }, [pickSite, sites]);

  function submit() {
    const surveyor = values.surveyor.trim();
    if (!values.site_id || !surveyor || !values.survey_date) {
      toast.error(pickSite ? "Site, surveyor and date are required." : "Surveyor and date are required.");
      return;
    }
    const common = {
      surveyor,
      survey_date: values.survey_date,
      status: values.status as SurveyStatus,
      summary: values.summary.trim() || null,
    };
    const done = (saved: Survey) => {
      toast.success(survey ? "Survey updated." : "Survey added.");
      onSaved?.(saved);
      onClose();
    };
    if (survey) {
      updateSurvey.mutate({ id: survey.id, body: common }, { onSuccess: done });
    } else {
      createSurvey.mutate({ site_id: values.site_id, ...common }, { onSuccess: done });
    }
  }

  const where = survey?.site_name ?? siteName ?? sites?.items.find((s) => s.id === siteId)?.name;
  return (
    <RecordFormDialog
      open={open}
      title={survey ? "Edit survey" : "Add survey"}
      description={where ? (survey ? `Survey of ${where}.` : `A new visit to ${where}.`) : undefined}
      fields={fields}
      values={values}
      onChange={(name, value) => setValues((v) => ({ ...v, [name]: value }))}
      onClose={onClose}
      onSubmit={submit}
      loading={createSurvey.isPending || updateSurvey.isPending}
    />
  );
}
