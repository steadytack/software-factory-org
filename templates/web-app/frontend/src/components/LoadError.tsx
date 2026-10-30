import { CloudOff } from "lucide-react";

import { isNetworkError } from "../lib/outbox";
import { Alert } from "./ui/alert";
import { Button } from "./ui/button";

/** A failed load: offline, says it isn't on the device yet (not an error to
 *  fix); otherwise the usual error message. */
export function LoadError({
  error,
  what,
  onRetry,
}: {
  error: unknown;
  what: string;
  /** Shown as a Try again button when given (usually the query's `refetch`). */
  onRetry?: () => void;
}) {
  if (isNetworkError(error)) {
    return (
      <Alert className="items-center">
        <CloudOff className="text-muted-foreground" />
        <span>
          Not available offline yet. The {what} will load next time you have a signal.
        </span>
        {onRetry && (
          <Button type="button" variant="outline" size="sm" className="ml-auto" onClick={onRetry}>
            Try again
          </Button>
        )}
      </Alert>
    );
  }
  return (
    <Alert variant="destructive" className="items-center">
      <span>Could not load the {what}.</span>
      {onRetry && (
        <Button type="button" variant="outline" size="sm" className="ml-auto" onClick={onRetry}>
          Try again
        </Button>
      )}
    </Alert>
  );
}
