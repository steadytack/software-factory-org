import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { toast } from "sonner";

import { api, expectData } from "../api/client";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Label } from "./ui/label";

const MIN_LENGTH = 10;

/** Change your own password. The server signs out every other session and
 *  re-issues this one's cookies, so the user stays signed in here. */
export function ChangePasswordForm() {
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");

  const change = useMutation({
    mutationFn: () =>
      expectData(
        () => api.POST("/api/auth/password", {
          body: { current_password: current, new_password: next },
        }),
      ),
    onSuccess: () => {
      setCurrent("");
      setNext("");
      setConfirm("");
      toast.success("Password changed. Other devices have been signed out.");
    },
  });

  const mismatch = confirm !== "" && confirm !== next;
  const tooShort = next !== "" && next.length < MIN_LENGTH;
  const ready = current !== "" && next.length >= MIN_LENGTH && next === confirm;

  return (
    <form
      className="grid gap-(--card-gap) sm:grid-cols-2"
      onSubmit={(e) => {
        e.preventDefault();
        if (ready) change.mutate();
      }}
    >
      <div className="space-y-(--field-gap) sm:col-span-2">
        <Label htmlFor="pw-current">Current password</Label>
        <Input
          id="pw-current"
          type="password"
          autoComplete="current-password"
          value={current}
          onChange={(e) => setCurrent(e.target.value)}
        />
      </div>
      <div className="space-y-(--field-gap)">
        <Label htmlFor="pw-new">New password</Label>
        <Input
          id="pw-new"
          type="password"
          autoComplete="new-password"
          aria-invalid={tooShort || undefined}
          aria-describedby="pw-new-hint"
          value={next}
          onChange={(e) => setNext(e.target.value)}
        />
        <p id="pw-new-hint" className={tooShort ? "text-xs text-destructive" : "text-xs text-muted-foreground"}>
          At least {MIN_LENGTH} characters.
        </p>
      </div>
      <div className="space-y-(--field-gap)">
        <Label htmlFor="pw-confirm">Confirm new password</Label>
        <Input
          id="pw-confirm"
          type="password"
          autoComplete="new-password"
          aria-invalid={mismatch || undefined}
          aria-describedby={mismatch ? "pw-confirm-hint" : undefined}
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
        />
        {mismatch && (
          <p id="pw-confirm-hint" className="text-xs text-destructive">
            Doesn&apos;t match the new password.
          </p>
        )}
      </div>
      <div className="sm:col-span-2">
        <Button type="submit" size="sm" disabled={!ready || change.isPending}>
          {change.isPending ? "Changing…" : "Change password"}
        </Button>
      </div>
    </form>
  );
}
