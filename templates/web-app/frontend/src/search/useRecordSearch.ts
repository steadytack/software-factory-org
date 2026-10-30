import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";

import { api, expectData } from "../api/client";
import { formatDate } from "../lib/format";

export interface RecordHit {
  id: string;
  group: "Surveys";
  label: string;
  hint?: string;
  to: string;
}

const PER_TYPE = 5;
const MIN_CHARS = 2;

function useDebounced(value: string, ms: number): string {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return debounced;
}

/** Ctrl+K search across records the palette doesn't hold locally: surveys,
 *  matched on the server (`q`) as the user types. */
export function useRecordSearch(query: string, enabled: boolean) {
  const q = useDebounced(query.trim(), 250);
  return useQuery({
    enabled: enabled && q.length >= MIN_CHARS,
    queryKey: ["record-search", q],
    staleTime: 30_000,
    queryFn: async (): Promise<RecordHit[]> => {
      const query = { q, offset: 0, limit: PER_TYPE };
      const surveys = await expectData(() => api.GET("/api/surveys", { params: { query } }));
      return surveys.items.map((s) => ({
        id: `survey-${s.id}`,
        group: "Surveys" as const,
        label: `Survey ${formatDate(s.survey_date)} by ${s.surveyor}`,
        hint: s.site_name ?? undefined,
        to: `/surveys/${s.id}`,
      }));
    },
  });
}
