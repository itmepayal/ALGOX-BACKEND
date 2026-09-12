/** Duplicated from AuthService for local JWT permission checks. Keep in sync. */
export type UserRole =
  | "user"
  | "moderator"
  | "content_manager"
  | "admin"
  | "super_admin";

export type Permission =
  | "admin:view"
  | "users:view"
  | "users:create"
  | "users:update"
  | "users:delete"
  | "problems:view"
  | "problems:create"
  | "problems:update"
  | "problems:delete"
  | "problems:publish"
  | "testcases:view"
  | "testcases:create"
  | "testcases:update"
  | "testcases:delete"
  | "submissions:view"
  | "submissions:update"
  | "submissions:delete"
  | "analytics:view"
  | "audit:view"
  | "health:view"
  | "discussions:view"
  | "discussions:moderate"
  | "discussions:delete"
  | "settings:view"
  | "settings:update"
  | "reports:view"
  | "reports:review"
  | "reports:resolve"
  | "announcements:create"
  | "announcements:publish"
  | "announcements:view"
  | "notifications:view"
  | "contests:create"
  | "contests:manage"
  | "sheets:create"
  | "sheets:manage"
  | "suspicious:view"
  | "suspicious:review"
  | "realtime:view"
  | "realtime:connections"
  | "realtime:rooms"
  | "realtime:events"
  | "realtime:broadcast"
  | "realtime:disconnect"
  | "realtime:debug"
  | "realtime:analytics"
  | "realtime:security";

export const ALL_PERMISSIONS: Permission[] = [
  "admin:view",
  "users:view",
  "users:create",
  "users:update",
  "users:delete",
  "problems:view",
  "problems:create",
  "problems:update",
  "problems:delete",
  "problems:publish",
  "testcases:view",
  "testcases:create",
  "testcases:update",
  "testcases:delete",
  "submissions:view",
  "submissions:update",
  "submissions:delete",
  "analytics:view",
  "audit:view",
  "health:view",
  "discussions:view",
  "discussions:moderate",
  "discussions:delete",
  "settings:view",
  "settings:update",
  "reports:view",
  "reports:review",
  "reports:resolve",
  "announcements:create",
  "announcements:publish",
  "announcements:view",
  "notifications:view",
  "contests:create",
  "contests:manage",
  "sheets:create",
  "sheets:manage",
  "suspicious:view",
  "suspicious:review",
  "realtime:view",
  "realtime:connections",
  "realtime:rooms",
  "realtime:events",
  "realtime:broadcast",
  "realtime:disconnect",
  "realtime:debug",
  "realtime:analytics",
  "realtime:security",
];

const MODERATOR_PERMS: Permission[] = [
  "admin:view",
  "users:view",
  "submissions:view",
  "discussions:view",
  "discussions:moderate",
  "discussions:delete",
  "reports:view",
  "reports:review",
  "reports:resolve",
  "audit:view",
  "health:view",
];

const CONTENT_MANAGER_PERMS: Permission[] = [
  "admin:view",
  "problems:view",
  "problems:create",
  "problems:update",
  "problems:publish",
  "testcases:view",
  "testcases:create",
  "testcases:update",
  "testcases:delete",
  "submissions:view",
  "analytics:view",
  "health:view",
];

const ADMIN_PERMS: Permission[] = [
  ...CONTENT_MANAGER_PERMS,
  "problems:delete",
  "users:view",
  "users:update",
  "submissions:update",
  "submissions:delete",
  "discussions:view",
  "discussions:moderate",
  "discussions:delete",
  "reports:view",
  "reports:review",
  "reports:resolve",
  "announcements:create",
  "announcements:publish",
  "announcements:view",
  "sheets:create",
  "sheets:manage",
  "suspicious:view",
  "suspicious:review",
  "realtime:view",
  "audit:view",
  "settings:view",
  "settings:update",
];

export const ROLE_PERMISSIONS: Record<UserRole, Permission[]> = {
  user: [],
  moderator: MODERATOR_PERMS,
  content_manager: CONTENT_MANAGER_PERMS,
  admin: ADMIN_PERMS,
  super_admin: [...ALL_PERMISSIONS],
};

export const STAFF_ROLES: UserRole[] = [
  "moderator",
  "content_manager",
  "admin",
  "super_admin",
];

export function normalizeRole(role: string | undefined | null): UserRole {
  if (!role) return "user";
  if ((STAFF_ROLES as string[]).includes(role) || role === "user") {
    return role as UserRole;
  }
  return "user";
}

export function permissionsForRole(role: string | undefined | null): Permission[] {
  return ROLE_PERMISSIONS[normalizeRole(role)] || [];
}

export function hasAnyPermission(
  role: string | undefined | null,
  permissions: Permission[]
): boolean {
  const set = new Set(permissionsForRole(role));
  return permissions.some((p) => set.has(p));
}

export function isStaffRole(role: string | undefined | null): boolean {
  return STAFF_ROLES.includes(normalizeRole(role));
}
