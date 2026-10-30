import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import type { ColumnDef } from "@tanstack/react-table";
import { KeyRound, UserCheck, UserCog, UserPlus, UserX } from "lucide-react";
import { toast } from "sonner";

import type { components } from "../types/openapi";
import { api, expectData } from "../api/client";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Label } from "./ui/label";
import { Badge } from "./ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "./ui/dialog";
import { ManagedDataTable } from "./ui/ManagedDataTable";
import { RowActions, RowActionsMenu } from "./ui/row-actions";
import { StatusBadge } from "./StatusBadge";
import { RelativeTime } from "./RelativeTime";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "./ui/select";
import { ROLE_HINTS, USER_ROLES, vocabularyLabel, type UserRole } from "../lib/vocabularies";
import { LoadError } from "./LoadError";
import { TableSkeleton } from "./ui/table-skeleton";

type User = components["schemas"]["UserRead"];

const EMPTY_NEW_USER = { email: "", password: "", displayName: "", role: "editor" as UserRole };

/** Admin-only user management panel (multi-user mode only — the Admin page
 *  doesn't render it when /auth/me reports multi_user=false). Uses the
 *  shared data table; per-user actions live in the row's ⋯ menu. */
export function UsersPanel({ myEmail }: { myEmail: string }) {
  const queryClient = useQueryClient();
  const [createOpen, setCreateOpen] = useState(false);
  const [newUser, setNewUser] = useState(EMPTY_NEW_USER);
  const [pwTarget, setPwTarget] = useState<User | null>(null);
  const [pwValue, setPwValue] = useState("");

  const users = useQuery({
    queryKey: ["users"],
    queryFn: () => expectData(() => api.GET("/api/users", {})),
  });

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ["users"] });

  const create = useMutation({
    mutationFn: (body: components["schemas"]["UserCreate"]) =>
      expectData(() => api.POST("/api/users", { body })),
    onSuccess: (u) => {
      toast.success(`Created ${u.email}.`);
      setNewUser(EMPTY_NEW_USER);
      setCreateOpen(false);
      invalidate();
    },
    onError: () => toast.error("Could not create the user. Check the email is not already in use and the password has at least 10 characters."),
  });

  const update = useMutation({
    mutationFn: ({ id, body }: { id: string; body: components["schemas"]["UserUpdate"] }) =>
      expectData(
        () => api.PATCH("/api/users/{user_id}", { params: { path: { user_id: id } }, body }),
      ),
    onSuccess: invalidate,
    onError: () => toast.error("Could not update the user."),
  });

  const setPassword = useMutation({
    mutationFn: ({ id, password }: { id: string; password: string }) =>
      expectData(
        () => api.POST("/api/users/{user_id}/password", {
          params: { path: { user_id: id } },
          body: { password },
        }),
      ),
    onSuccess: () => {
      toast.success("Password updated.");
      setPwTarget(null);
      setPwValue("");
      invalidate();
    },
    onError: () => toast.error("Could not change the password. It needs at least 10 characters."),
  });

  const columns = useMemo<ColumnDef<User, unknown>[]>(
    () => [
      {
        id: "email",
        accessorKey: "email",
        header: "Email",
        meta: { width: "14rem" },
        cell: ({ row }) => {
          const u = row.original;
          const tags = [u.email === myEmail && "You", u.is_bootstrap && "Bootstrap"].filter(Boolean);
          return (
            <span className="flex items-center gap-2">
              <span className="font-medium">{u.email}</span>
              {tags.map((t) => (
                <Badge key={String(t)} variant="secondary" className="h-4 px-2 text-micro">
                  {t}
                </Badge>
              ))}
            </span>
          );
        },
      },
      {
        id: "display_name",
        accessorKey: "display_name",
        header: "Name",
        cell: (info) => info.getValue<string | null>() ?? <span className="text-muted-foreground">—</span>,
      },
      {
        id: "role",
        accessorFn: (u) => vocabularyLabel(u.role),
        header: "Role",
        cell: (info) => info.getValue<string>(),
      },
      {
        id: "status",
        accessorFn: (u) => (u.is_active ? "active" : "disabled"),
        header: "Status",
        cell: (info) => (
          <StatusBadge
            value={info.getValue<string>()}
            tone={info.getValue<string>() === "active" ? "success" : "neutral"}
          />
        ),
      },
      {
        id: "last_login_at",
        accessorKey: "last_login_at",
        header: "Last login",
        cell: (info) => {
          const v = info.getValue<string | null>();
          return v ? (
            <RelativeTime value={v} className="text-muted-foreground" />
          ) : (
            <span className="text-muted-foreground">Never</span>
          );
        },
      },
      {
        id: "actions",
        header: "",
        enableSorting: false,
        meta: { width: "shrink", align: "right" },
        cell: ({ row }) => {
          const u = row.original;
          return (
            <RowActions>
              <RowActionsMenu
                label={`Actions for ${u.email}`}
                items={[
                  {
                    label: u.is_active ? "Disable account" : "Enable account",
                    icon: u.is_active ? <UserX /> : <UserCheck />,
                    tone: u.is_active ? "destructive" : undefined,
                    disabled: update.isPending,
                    onSelect: () => update.mutate({ id: u.id, body: { is_active: !u.is_active } }),
                  },
                  ...USER_ROLES.filter((r) => r !== u.role).map((r) => ({
                    label: `Make ${vocabularyLabel(r).toLowerCase()}`,
                    icon: <UserCog />,
                    disabled: update.isPending,
                    onSelect: () => update.mutate({ id: u.id, body: { role: r } }),
                  })),
                  {
                    label: "Set password…",
                    icon: <KeyRound />,
                    separated: true,
                    onSelect: () => {
                      setPwValue("");
                      setPwTarget(u);
                    },
                  },
                ]}
              />
            </RowActions>
          );
        },
      },
    ],
    // `update.mutate` is stable; isPending only greys items while a change is in flight.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [myEmail, update.isPending],
  );

  return (
    <div className="space-y-(--card-gap)">
      {users.isError && <LoadError error={users.error} what="users" onRetry={() => void users.refetch()} />}
      {users.isPending ? (
        <TableSkeleton rows={3} />
      ) : (
        <ManagedDataTable
          data={users.data ?? []}
          columns={columns}
          exportName="users"
          emptyMessage="No users yet."
          autoHeight
          primaryAction={{ label: "Add user", icon: <UserPlus />, onClick: () => setCreateOpen(true) }}
        />
      )}

      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Add user</DialogTitle>
            <DialogDescription>They can sign in straight away with this password.</DialogDescription>
          </DialogHeader>
          <form
            id="create-user"
            className="grid gap-(--card-gap)"
            onSubmit={(e) => {
              e.preventDefault();
              create.mutate({
                email: newUser.email,
                password: newUser.password,
                display_name: newUser.displayName || null,
                role: newUser.role,
              });
            }}
          >
            <div className="space-y-(--field-gap)">
              <Label htmlFor="new-user-email">Email</Label>
              <Input
                id="new-user-email"
                type="email"
                value={newUser.email}
                onChange={(e) => setNewUser((n) => ({ ...n, email: e.target.value }))}
                placeholder="user@example.com"
                autoFocus
              />
            </div>
            <div className="space-y-(--field-gap)">
              <Label htmlFor="new-user-name">Display name (optional)</Label>
              <Input
                id="new-user-name"
                value={newUser.displayName}
                onChange={(e) => setNewUser((n) => ({ ...n, displayName: e.target.value }))}
              />
            </div>
            <div className="space-y-(--field-gap)">
              <Label htmlFor="new-user-pw">Password (min 10 characters)</Label>
              <Input
                id="new-user-pw"
                type="password"
                value={newUser.password}
                onChange={(e) => setNewUser((n) => ({ ...n, password: e.target.value }))}
              />
            </div>
            <div className="space-y-(--field-gap)">
              <Label htmlFor="new-user-role">Role</Label>
              <Select
                value={newUser.role}
                onValueChange={(v) => setNewUser((n) => ({ ...n, role: v as UserRole }))}
              >
                <SelectTrigger id="new-user-role" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {USER_ROLES.map((r) => (
                    <SelectItem key={r} value={r}>
                      {vocabularyLabel(r)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">{ROLE_HINTS[newUser.role]}</p>
            </div>
          </form>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setCreateOpen(false)}>
              Cancel
            </Button>
            <Button
              type="submit"
              form="create-user"
              disabled={!newUser.email || newUser.password.length < 10 || create.isPending}
            >
              Create user
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={pwTarget !== null} onOpenChange={(o) => !o && setPwTarget(null)}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Set password</DialogTitle>
            <DialogDescription>{pwTarget?.email}</DialogDescription>
          </DialogHeader>
          <form
            id="set-password"
            onSubmit={(e) => {
              e.preventDefault();
              if (pwTarget && pwValue.length >= 10)
                setPassword.mutate({ id: pwTarget.id, password: pwValue });
            }}
            className="space-y-(--field-gap)"
          >
            <Label htmlFor="set-pw">New password (min 10 characters)</Label>
            <Input
              id="set-pw"
              type="password"
              value={pwValue}
              onChange={(e) => setPwValue(e.target.value)}
              autoFocus
            />
          </form>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setPwTarget(null)}>
              Cancel
            </Button>
            <Button
              type="submit"
              form="set-password"
              disabled={pwValue.length < 10 || setPassword.isPending}
            >
              Set password
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
