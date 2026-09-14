/** Minimal RBAC mirror for ContentService JWT checks. Keep in sync with AuthService. */
export type UserRole =
  | "user"
  | "moderator"
  | "content_manager"
  | "admin"
  | "super_admin";

export type Permission =
  | "admin:view"
  | "content:view"
  | "content:create"
  | "content:update"
  | "content:delete"
  | "problems:view"
  | "problems:update"
  | "announcements:create";

const CONTENT_MANAGER: Permission[] = [
  "admin:view",
  "content:view",
  "content:create",
  "content:update",
  "content:delete",
  "problems:view",
  "problems:update",
];

const ADMIN: Permission[] = [...CONTENT_MANAGER, "announcements:create"];

const ROLE_PERMISSIONS: Record<UserRole, Permission[]> = {
  user: [],
  moderator: ["admin:view", "content:view"],
  content_manager: CONTENT_MANAGER,
  admin: ADMIN,
  super_admin: [
    "admin:view",
    "content:view",
    "content:create",
    "content:update",
    "content:delete",
    "problems:view",
    "problems:update",
    "announcements:create",
  ],
};

const STAFF: UserRole[] = [
  "moderator",
  "content_manager",
  "admin",
  "super_admin",
];

export function normalizeRole(role: string | undefined | null): UserRole {
  if (!role) return "user";
  if ((STAFF as string[]).includes(role) || role === "user") {
    return role as UserRole;
  }
  return "user";
}

export function hasAnyPermission(
  role: string | undefined | null,
  permissions: Permission[]
): boolean {
  const set = new Set(ROLE_PERMISSIONS[normalizeRole(role)] || []);
  return permissions.some((p) => set.has(p));
}
