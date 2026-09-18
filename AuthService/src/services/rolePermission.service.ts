import {
  ALL_PERMISSIONS,
  ROLE_PERMISSIONS,
  normalizeRole,
  type Permission,
  type UserRole,
} from "../rbac/permissions";
import { RolePermissionConfig } from "../models/rolePermissionConfig.model";
import { BadRequestError, ForbiddenError } from "../utils/errors/app.error";
import { writeAdminAudit } from "../utils/helpers/audit.helper";

/** In-memory override cache. Null = use static defaults. */
const overrideCache = new Map<UserRole, Permission[] | null>();
let cacheLoaded = false;

export async function loadRolePermissionCache(): Promise<void> {
  const rows = await RolePermissionConfig.find({}).lean();
  overrideCache.clear();
  for (const r of rows) {
    const role = normalizeRole(r.role);
    overrideCache.set(role, (r.permissions || []) as Permission[]);
  }
  cacheLoaded = true;
}

export function permissionsForRoleResolved(
  role: string | undefined | null
): Permission[] {
  const r = normalizeRole(role);
  if (r === "super_admin") return [...ALL_PERMISSIONS];
  if (cacheLoaded && overrideCache.has(r)) {
    const custom = overrideCache.get(r);
    if (custom) return [...custom];
  }
  return [...(ROLE_PERMISSIONS[r] || [])];
}

export function hasPermissionResolved(
  role: string | undefined | null,
  permission: Permission
): boolean {
  return permissionsForRoleResolved(role).includes(permission);
}

export function hasAnyPermissionResolved(
  role: string | undefined | null,
  permissions: Permission[]
): boolean {
  const set = new Set(permissionsForRoleResolved(role));
  return permissions.some((p) => set.has(p));
}

export class RolePermissionService {
  async getMatrix() {
    if (!cacheLoaded) await loadRolePermissionCache();
    const roles: UserRole[] = [
      "user",
      "moderator",
      "content_manager",
      "admin",
      "super_admin",
    ];
    const matrix: Record<string, Permission[]> = {};
    for (const role of roles) {
      matrix[role] = permissionsForRoleResolved(role);
    }
    const overrides = await RolePermissionConfig.find({})
      .select("role updatedBy updatedAt")
      .lean();
    return {
      permissions: ALL_PERMISSIONS,
      matrix,
      overrides: overrides.map((o) => ({
        role: o.role,
        updatedBy: o.updatedBy,
        updatedAt: o.updatedAt,
      })),
    };
  }

  async updateRolePermissions(input: {
    role: string;
    permissions: string[];
    actor: { userId: string; email?: string; role: string };
    ip?: string;
    userAgent?: string;
  }) {
    if (input.actor.role !== "super_admin") {
      throw new ForbiddenError("Only super_admin can edit role permissions");
    }
    // Defense in depth — route requires roles:manage (super_admin only).
    if (!hasPermissionResolved(input.actor.role, "roles:manage")) {
      throw new ForbiddenError("roles:manage permission required");
    }
    const role = normalizeRole(input.role);
    if (role === "super_admin") {
      throw new BadRequestError("super_admin always has all permissions");
    }
    if (role === "user") {
      throw new BadRequestError("End-user role cannot be granted admin permissions");
    }

    const allowed = new Set(ALL_PERMISSIONS);
    // Never grant roles:manage via matrix — reserved for super_admin only.
    allowed.delete("roles:manage");
    const next = [
      ...new Set(
        (input.permissions || []).filter((p): p is Permission =>
          allowed.has(p as Permission)
        )
      ),
    ];
    // Staff roles must keep admin:view to reach the console
    if (!next.includes("admin:view")) {
      next.unshift("admin:view");
    }

    const before = permissionsForRoleResolved(role);
    await RolePermissionConfig.findOneAndUpdate(
      { role },
      {
        $set: {
          permissions: next,
          updatedBy: input.actor.userId,
        },
      },
      { upsert: true, returnDocument: "after" }
    );
    overrideCache.set(role, next);
    cacheLoaded = true;

    await writeAdminAudit({
      actorId: input.actor.userId,
      actorEmail: input.actor.email,
      action: "roles.update_permissions",
      resource: "role",
      resourceId: role,
      before: { permissions: before },
      after: { permissions: next },
      ip: input.ip,
      userAgent: input.userAgent,
    });

    return { role, permissions: next };
  }

  async resetRole(
    roleRaw: string,
    actor: { userId: string; email?: string; role: string },
    meta?: { ip?: string; userAgent?: string }
  ) {
    if (actor.role !== "super_admin") {
      throw new ForbiddenError("Only super_admin can reset role permissions");
    }
    if (!hasPermissionResolved(actor.role, "roles:manage")) {
      throw new ForbiddenError("roles:manage permission required");
    }
    const role = normalizeRole(roleRaw);
    if (role === "super_admin" || role === "user") {
      throw new BadRequestError("Cannot reset this role");
    }
    const before = permissionsForRoleResolved(role);
    await RolePermissionConfig.deleteOne({ role });
    overrideCache.delete(role);
    const after = permissionsForRoleResolved(role);
    await writeAdminAudit({
      actorId: actor.userId,
      actorEmail: actor.email,
      action: "roles.reset_permissions",
      resource: "role",
      resourceId: role,
      before: { permissions: before },
      after: { permissions: after },
      ip: meta?.ip,
      userAgent: meta?.userAgent,
    });
    return { role, permissions: after };
  }
}

export const rolePermissionService = new RolePermissionService();
