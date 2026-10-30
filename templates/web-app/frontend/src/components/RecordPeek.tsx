import type { ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";

import { AttachmentsTab } from "./AttachmentsTab";
import { ChangelogTab, fetchChangelog } from "./ChangelogTab";
import { CommentsTab } from "./CommentsTab";
import { LoadError } from "./LoadError";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "./ui/tabs";
import type { EntityName } from "../lib/vocabularies";

export interface PeekField {
  label: string;
  value: ReactNode;
}

/** Body of a list page's side panel: the record's key fields, then its
 *  comments, attachments and history — the same tabs its full page uses. */
export function RecordPeek({
  entity,
  entityId,
  updatedAt,
  fields,
  children,
}: {
  entity: EntityName;
  entityId: string;
  /** Refetches the history when the record changes (same key as the
   *  detail pages use). */
  updatedAt?: string;
  fields: PeekField[];
  /** Extra content under the fields, e.g. a summary paragraph. */
  children?: ReactNode;
}) {
  const changelog = useQuery({
    queryKey: ["changelog", entity, entityId, updatedAt],
    queryFn: () => fetchChangelog(entity, entityId),
  });

  return (
    <Tabs defaultValue="details" className="gap-4">
      <TabsList variant="line" className="w-full justify-start border-b border-border">
        <TabsTrigger value="details" className="flex-none">
          Details
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
      </TabsList>
      <TabsContent value="details" className="flex flex-col gap-4">
        <dl className="grid grid-cols-[minmax(6rem,auto)_1fr] gap-x-4 gap-y-2 text-sm">
          {fields.map((f) => (
            <div key={f.label} className="contents">
              <dt className="text-muted-foreground">{f.label}</dt>
              <dd className="min-w-0 break-words text-foreground">{f.value}</dd>
            </div>
          ))}
        </dl>
        {children}
      </TabsContent>
      <TabsContent value="comments">
        <CommentsTab entity={entity} entityId={entityId} />
      </TabsContent>
      <TabsContent value="attachments">
        <AttachmentsTab entity={entity} entityId={entityId} />
      </TabsContent>
      <TabsContent value="history">
        {changelog.isError ? (
          <LoadError error={changelog.error} what="history" />
        ) : (
          <ChangelogTab entries={changelog.data?.items ?? []} />
        )}
      </TabsContent>
    </Tabs>
  );
}
