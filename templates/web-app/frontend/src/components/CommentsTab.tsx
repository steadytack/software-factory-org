/** Comments tab: post, search, sort and delete discussion comments for a
 *  record. Tailwind port of the reference template's CommentsTab. */
import { useMemo, useState } from "react";
import { ArrowUpDown, ListFilter, MessageSquare, Plus, Trash2, X } from "lucide-react";
import { RowActionButton } from "./ui/row-actions";
import { IconSelect } from "./ui/icon-select";
import { SearchToggle } from "./ui/search-toggle";
import { useCan } from "../hooks/useCan";

import {
  useComments,
  useCreateComment,
  useDeleteComment,
} from "../hooks/useComments";
import { RelativeTime } from "./RelativeTime";
import { Button } from "./ui/button";
import { IconButton } from "./ui/icon-button";
import { Input } from "./ui/input";
import { LoadError } from "./LoadError";
import { EmptyState } from "./ui/empty-state";
import type { EntityName } from "../lib/vocabularies";
import { PageCapBanner } from "./PageCapBanner";
import { ListSkeleton } from "./ui/list-skeleton";

const ALL_AUTHORS = "__all__";

export function CommentsTab({
  entity,
  entityId,
}: {
  /** Typed to the vocabulary: the API now refuses an unknown
   *  or wrong-case entity with a 422 instead of returning an empty 200. */
  entity: EntityName;
  entityId: string;
}) {
  const { data, isPending, isError, error } = useComments(entity, entityId);
  const createComment = useCreateComment(entity, entityId);
  const deleteComment = useDeleteComment(entity, entityId);
  const can = useCan();
  const [draft, setDraft] = useState("");
  // The composer opens from the Add button, in its own row, and closes once the comment is posted.
  const [composing, setComposing] = useState(false);
  const [search, setSearch] = useState("");
  const [sortKey, setSortKey] = useState<"newest" | "oldest">("newest");
  const [author, setAuthor] = useState(ALL_AUTHORS);

  const comments = data?.items ?? [];
  const authors = useMemo(() => [...new Set(comments.map((c) => c.author))].sort(), [comments]);

  const filtered = useMemo(() => {
    let result = comments.filter((c) => author === ALL_AUTHORS || c.author === author);
    if (search.trim()) {
      const q = search.toLowerCase();
      result = result.filter(
        (c) =>
          c.text.toLowerCase().includes(q) || c.author.toLowerCase().includes(q),
      );
    }
    result.sort((a, b) => {
      const diff =
        new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
      return sortKey === "newest" ? diff : -diff;
    });
    return result;
  }, [comments, search, sortKey, author]);

  function post() {
    const text = draft.trim();
    if (!text) return;
    createComment.mutate(text, {
      onSuccess: () => {
        setDraft("");
        setComposing(false);
      },
    });
  }

  return (
    <div className="rounded-lg border border-border bg-card p-3">
      {/* FLT-5: the server caps this list at 100 and returns the real total;
          say so instead of silently searching a subset. */}
      <PageCapBanner loaded={comments.length} total={data?.total} noun="comments" />

      {/* Toolbar */}
      <div className="mb-2 flex flex-wrap items-center gap-2">
        {composing ? (
          <div className="flex basis-full items-center gap-2">
            <Input
              value={draft}
              autoFocus
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  post();
                } else if (e.key === "Escape") setComposing(false);
              }}
              placeholder="Add a comment…"
              aria-label="New comment"
              className="h-8 text-dense pointer-coarse:h-11 pointer-coarse:text-base"
            />
            <Button size="sm" onClick={post} disabled={!draft.trim() || createComment.isPending}>
              {createComment.isPending ? "…" : "Post"}
            </Button>
            <IconButton label="Cancel" variant="ghost" onClick={() => setComposing(false)}>
              <X />
            </IconButton>
          </div>
        ) : (
          <IconButton label="Add comment" variant="default" onClick={() => setComposing(true)}>
            <Plus />
          </IconButton>
        )}
        <SearchToggle value={search} onChange={setSearch} label="Search comments" placeholder="Search comments…" />
        <IconSelect
          icon={<ListFilter />}
          label="Filter by author"
          highlighted={author !== ALL_AUTHORS}
          value={author}
          onChange={setAuthor}
          options={[{ value: ALL_AUTHORS, label: "All authors" }, ...authors.map((a) => ({ value: a, label: a }))]}
        />
        <IconSelect
          icon={<ArrowUpDown />}
          label="Sort comments"
          value={sortKey}
          onChange={(v) => setSortKey(v as "newest" | "oldest")}
          options={[
            { value: "newest", label: "Newest first" },
            { value: "oldest", label: "Oldest first" },
          ]}
        />
        <span className="ml-auto shrink-0 whitespace-nowrap text-xs text-tertiary tnum">
          {/* Counts the SERVER total, not the loaded array, so the number
              cannot silently understate past the page cap. */}
          {filtered.length} / {data?.total ?? comments.length}
        </span>
      </div>

      {/* List */}
      {isPending ? (
        <ListSkeleton />
      ) : isError ? (
        <LoadError error={error} what="comments" />
      ) : filtered.length === 0 ? (
        <EmptyState
          icon={<MessageSquare className="size-8" />}
          title={comments.length === 0 ? "No comments yet" : "No matches"}
          description={
            comments.length === 0
              ? "Add the first one with +."
              : "No comments match your search."
          }
        />
      ) : (
        <ul className="divide-y divide-border">
          {filtered.map((c) => (
            <li key={c.id} className="flex items-start gap-3 py-2">
              <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-primary/10 text-xs font-semibold text-primary">
                {c.author.slice(0, 2).toUpperCase()}
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-sm leading-snug text-foreground">
                  {c.text}
                </p>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  {c.author} · <RelativeTime value={c.created_at} />
                </p>
              </div>
              {can.remove && (
                <RowActionButton
                  label="Delete comment"
                  tone="destructive"
                  size="icon-xs"
                  onClick={() => deleteComment.mutate(c.id)}
                >
                  <Trash2 />
                </RowActionButton>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}