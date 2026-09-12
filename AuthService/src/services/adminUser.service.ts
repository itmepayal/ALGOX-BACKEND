import { User } from "../models/user.model";
import { AdminAuditLog } from "../models/adminAuditLog.model";
import {
  BadRequestError,
  ForbiddenError,
  NotFoundError,
} from "../utils/errors/app.error";
import { writeAdminAudit } from "../utils/helpers/audit.helper";
import {
  normalizeRole,
  permissionsForRole,
  type AccountStatus,
  STAFF_ROLES,
} from "../rbac/permissions";

function publicUser(u: any) {
  return {
    id: u._id?.toString?.() || u.id,
    name: u.name,
    email: u.email,
    avatar: u.avatar || "",
    role: normalizeRole(u.role),
    status: (u.status as AccountStatus) || "active",
    isEmailVerified: Boolean(u.isEmailVerified),
    twoFactorEnabled: Boolean(u.twoFactorEnabled),
    lastActiveAt: u.lastActiveAt,
    createdAt: u.createdAt,
    updatedAt: u.updatedAt,
  };
}

export class AdminUserService {
  async listUsers(query: {
    page?: number;
    limit?: number;
    search?: string;
    role?: string;
    status?: string;
  }) {
    const page = Math.max(1, query.page || 1);
    const limit = Math.min(100, Math.max(1, query.limit || 20));
    const filter: Record<string, unknown> = {};

    if (query.search?.trim()) {
      const q = query.search.trim();
      filter.$or = [
        { email: { $regex: q, $options: "i" } },
        { name: { $regex: q, $options: "i" } },
      ];
    }
    if (query.role && query.role !== "all") {
      filter.role = normalizeRole(query.role);
    }
    if (query.status && query.status !== "all") {
      filter.status = query.status;
    }

    const [total, rows] = await Promise.all([
      User.countDocuments(filter),
      User.find(filter)
        .sort({ createdAt: -1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .lean(),
    ]);

    return {
      users: rows.map(publicUser),
      meta: {
        total,
        page,
        limit,
        totalPages: Math.max(1, Math.ceil(total / limit)),
      },
    };
  }

  async getUserById(id: string) {
    const user = await User.findById(id).lean();
    if (!user) throw new NotFoundError("User not found");
    return {
      ...publicUser(user),
      permissions: permissionsForRole((user as any).role),
    };
  }

  async updateRole(
    actor: { userId: string; email?: string; role: string },
    targetId: string,
    nextRoleRaw: string,
    meta?: { ip?: string; userAgent?: string }
  ) {
    const actorRole = normalizeRole(actor.role);
    const nextRole = normalizeRole(nextRoleRaw);
    const target = await User.findById(targetId);
    if (!target) throw new NotFoundError("User not found");

    const prevRole = normalizeRole(target.role);

    // Only super_admin may assign admin or super_admin
    if (
      (nextRole === "admin" || nextRole === "super_admin") &&
      actorRole !== "super_admin"
    ) {
      throw new ForbiddenError("Only Super Admin can assign Admin or Super Admin roles");
    }
    if (prevRole === "super_admin" && actorRole !== "super_admin") {
      throw new ForbiddenError("Only Super Admin can modify Super Admin accounts");
    }
    if (actor.userId === targetId && nextRole !== prevRole) {
      throw new BadRequestError("You cannot change your own role");
    }

    target.role = nextRole;
    await target.save();

    await writeAdminAudit({
      actorId: actor.userId,
      actorEmail: actor.email,
      action: "user.role_change",
      resource: "user",
      resourceId: targetId,
      before: { role: prevRole },
      after: { role: nextRole },
      ip: meta?.ip,
      userAgent: meta?.userAgent,
    });

    return publicUser(target);
  }

  async updateStatus(
    actor: { userId: string; email?: string; role: string },
    targetId: string,
    nextStatus: AccountStatus,
    meta?: { ip?: string; userAgent?: string }
  ) {
    if (!["active", "suspended", "banned"].includes(nextStatus)) {
      throw new BadRequestError("Invalid status");
    }
    const target = await User.findById(targetId);
    if (!target) throw new NotFoundError("User not found");

    if (actor.userId === targetId) {
      throw new BadRequestError("You cannot change your own account status");
    }

    const actorRole = normalizeRole(actor.role);
    const targetRole = normalizeRole(target.role);
    if (targetRole === "super_admin" && actorRole !== "super_admin") {
      throw new ForbiddenError("Only Super Admin can change Super Admin status");
    }

    const prev = (target.status as AccountStatus) || "active";
    target.status = nextStatus;
    await target.save();

    await writeAdminAudit({
      actorId: actor.userId,
      actorEmail: actor.email,
      action: "user.status_change",
      resource: "user",
      resourceId: targetId,
      before: { status: prev },
      after: { status: nextStatus },
      ip: meta?.ip,
      userAgent: meta?.userAgent,
    });

    return publicUser(target);
  }

  async listAuditLogs(query: {
    page?: number;
    limit?: number;
    resource?: string;
    action?: string;
    actorId?: string;
  }) {
    const page = Math.max(1, query.page || 1);
    const limit = Math.min(100, Math.max(1, query.limit || 20));
    const filter: Record<string, unknown> = {};
    if (query.resource) filter.resource = query.resource;
    if (query.action) filter.action = query.action;
    if (query.actorId) filter.actorId = query.actorId;

    const [total, rows] = await Promise.all([
      AdminAuditLog.countDocuments(filter),
      AdminAuditLog.find(filter)
        .sort({ createdAt: -1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .lean(),
    ]);

    return {
      logs: rows.map((r: any) => ({
        id: r._id.toString(),
        actorId: r.actorId?.toString?.() || r.actorId,
        actorEmail: r.actorEmail,
        action: r.action,
        resource: r.resource,
        resourceId: r.resourceId,
        before: r.before,
        after: r.after,
        ip: r.ip,
        userAgent: r.userAgent,
        createdAt: r.createdAt,
      })),
      meta: {
        total,
        page,
        limit,
        totalPages: Math.max(1, Math.ceil(total / limit)),
      },
    };
  }

  /** Cross-service / admin append-only audit write (never throws to caller). */
  async writeAuditLog(
    actor: { userId: string; email?: string; role?: string },
    input: {
      action: string;
      resource: string;
      resourceId?: string;
      before?: Record<string, unknown>;
      after?: Record<string, unknown>;
    },
    meta?: { ip?: string; userAgent?: string }
  ) {
    await writeAdminAudit({
      actorId: actor.userId,
      actorEmail: actor.email,
      action: input.action,
      resource: input.resource,
      resourceId: input.resourceId,
      before: input.before,
      after: input.after,
      ip: meta?.ip,
      userAgent: meta?.userAgent,
    });
  }

  /** Thin internal stats for Analytics KPI fan-in. */
  async internalUserStats() {
    const now = new Date();
    const startOfDay = new Date(now);
    startOfDay.setHours(0, 0, 0, 0);
    const d7 = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    const d30 = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

    const [
      totalUsers,
      activeUsers,
      suspendedUsers,
      bannedUsers,
      todayUsers,
      staffUsers,
      dau,
      wau,
      mau,
    ] = await Promise.all([
      User.countDocuments({}),
      User.countDocuments({ status: "active" }),
      User.countDocuments({ status: "suspended" }),
      User.countDocuments({ status: "banned" }),
      User.countDocuments({ createdAt: { $gte: startOfDay } }),
      User.countDocuments({ role: { $in: STAFF_ROLES } }),
      User.countDocuments({ lastActiveAt: { $gte: startOfDay } }),
      User.countDocuments({ lastActiveAt: { $gte: d7 } }),
      User.countDocuments({ lastActiveAt: { $gte: d30 } }),
    ]);

    // Daily growth last 30 days
    const growth = await User.aggregate([
      { $match: { createdAt: { $gte: d30 } } },
      {
        $group: {
          _id: { $dateToString: { format: "%Y-%m-%d", date: "$createdAt" } },
          count: { $sum: 1 },
        },
      },
      { $sort: { _id: 1 } },
    ]);

    return {
      totalUsers,
      activeUsers,
      suspendedUsers,
      bannedUsers,
      todayUsers,
      staffUsers,
      dau,
      wau,
      mau,
      growth: growth.map((g) => ({ date: g._id, count: g.count })),
    };
  }
}

export const adminUserService = new AdminUserService();
