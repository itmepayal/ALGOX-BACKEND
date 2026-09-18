/**
 * Horizontal authorization — private resources must belong to the caller.
 * Never trust a client-supplied userId for ownership.
 */

import { ForbiddenError, UnauthorizedError } from "../errors/app.error";

/**
 * Assert JWT subject owns the resource.
 * @param actorUserId - from req.user.userId (authenticated)
 * @param resourceOwnerId - stored owner on the document
 */
export function assertResourceOwner(
  actorUserId: string | null | undefined,
  resourceOwnerId: string | null | undefined,
  message = "Unauthorized access to this resource"
): void {
  const actor = String(actorUserId || "").trim();
  const owner = String(resourceOwnerId || "").trim();
  if (!actor) {
    throw new UnauthorizedError("Authentication required");
  }
  if (!owner || actor !== owner) {
    throw new ForbiddenError(message, {
      code: "HORIZONTAL_AUTHZ_DENIED",
    });
  }
}

/**
 * Reject requests that try to act on behalf of another user via body/query/params.
 */
export function rejectSpoofedUserId(
  actorUserId: string,
  claimed: unknown,
  field = "userId"
): void {
  if (claimed == null || claimed === "") return;
  if (String(claimed) !== String(actorUserId)) {
    throw new ForbiddenError(`Cannot set ${field} for another user`, {
      code: "USER_ID_SPOOF_REJECTED",
      field,
    });
  }
}
