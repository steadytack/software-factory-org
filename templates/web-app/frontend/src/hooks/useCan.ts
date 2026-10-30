import { useAuth } from "./useAuth";
import type { UserRole } from "../lib/vocabularies";

const RANK: Record<UserRole, number> = { viewer: 0, editor: 1, admin: 2 };

/** What the signed-in user may do — mirrors the server's rules
 *  (backend/app/core/auth.py). The server still enforces them; this only
 *  keeps the UI from offering controls that would fail with a 403.
 *
 *  - edit:   create and change sites and surveys
 *  - remove: delete records
 *  - admin:  user management and the Admin page */
export function useCan() {
  const { role, isLoading } = useAuth();
  const at = (minimum: UserRole) => !isLoading && RANK[role] >= RANK[minimum];
  // `ready`: the role is known (everything reads false until it is).
  return { edit: at("editor"), remove: at("admin"), admin: at("admin"), role, ready: !isLoading };
}
