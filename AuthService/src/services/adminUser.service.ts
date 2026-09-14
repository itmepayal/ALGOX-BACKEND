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
import { sessionRepository } from "../repositories/session.repository";

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
    mustChangePassword: Boolean(u.mustChangePassword),
    deletedAt: u.deletedAt || null,
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
    const filter: Record<string, unknown> = {
      // Soft-deleted accounts hidden unless explicitly filtered
      deletedAt: null,
    };

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
      if (query.status === "deleted") {
        delete filter.deletedAt;
        filter.deletedAt = { $ne: null };
      } else {
        filter.status = query.status;
      }
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

    // Invalidate all sessions immediately on suspend/ban so refresh tokens die
    if (nextStatus === "suspended" || nextStatus === "banned") {
      await sessionRepository.deleteByUser(targetId);
    }

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

  /** Thin internal stats for Analytics KPI fan-in / dashboard fallback. */
  async internalUserStats(rangeDays = 30) {
    const days = Math.min(Math.max(Number(rangeDays) || 30, 1), 366);
    const now = new Date();
    const startOfDay = new Date(now);
    startOfDay.setHours(0, 0, 0, 0);
    const d7 = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    const d30 = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    const rangeStart = new Date(now.getTime() - days * 24 * 60 * 60 * 1000);
    const prevRangeStart = new Date(
      rangeStart.getTime() - days * 24 * 60 * 60 * 1000
    );

    const [
      totalUsers,
      activeUsers,
      suspendedUsers,
      bannedUsers,
      todayUsers,
      staffUsers,
      adminUsers,
      verifiedUsers,
      unverifiedUsers,
      dau,
      wau,
      mau,
      newUsersInRange,
      newUsersPrevRange,
      byRole,
    ] = await Promise.all([
      User.countDocuments({}),
      User.countDocuments({ status: "active" }),
      User.countDocuments({ status: "suspended" }),
      User.countDocuments({ status: "banned" }),
      User.countDocuments({ createdAt: { $gte: startOfDay } }),
      User.countDocuments({ role: { $in: STAFF_ROLES } }),
      User.countDocuments({ role: { $in: ["admin", "super_admin"] } }),
      User.countDocuments({ isEmailVerified: true }),
      User.countDocuments({ isEmailVerified: { $ne: true } }),
      User.countDocuments({ lastActiveAt: { $gte: startOfDay } }),
      User.countDocuments({ lastActiveAt: { $gte: d7 } }),
      User.countDocuments({ lastActiveAt: { $gte: d30 } }),
      User.countDocuments({ createdAt: { $gte: rangeStart } }),
      User.countDocuments({
        createdAt: { $gte: prevRangeStart, $lt: rangeStart },
      }),
      User.aggregate([{ $group: { _id: "$role", count: { $sum: 1 } } }]),
    ]);

    const growth = await User.aggregate([
      { $match: { createdAt: { $gte: rangeStart } } },
      {
        $group: {
          _id: { $dateToString: { format: "%Y-%m-%d", date: "$createdAt" } },
          count: { $sum: 1 },
        },
      },
      { $sort: { _id: 1 } },
    ]);

    const roleMap: Record<string, number> = {};
    for (const row of byRole) {
      roleMap[String(row._id || "unknown")] = row.count;
    }

    const inactiveUsers = Math.max(0, totalUsers - activeUsers);
    const blockedUsers = suspendedUsers + bannedUsers;

    let newUsersTrendPct: number | null = null;
    if (newUsersPrevRange > 0) {
      newUsersTrendPct =
        Math.round(
          ((newUsersInRange - newUsersPrevRange) / newUsersPrevRange) * 1000
        ) / 10;
    } else if (newUsersInRange > 0) {
      newUsersTrendPct = null; // no prior baseline — do not invent
    }

    return {
      totalUsers,
      activeUsers,
      inactiveUsers,
      suspendedUsers,
      bannedUsers,
      blockedUsers,
      todayUsers,
      staffUsers,
      adminUsers,
      verifiedUsers,
      unverifiedUsers,
      newUsersInRange,
      newUsersPrevRange,
      newUsersTrendPct,
      dau,
      wau,
      mau,
      byRole: roleMap,
      growth: growth.map((g) => ({ date: g._id, count: g.count })),
    };
  }

  async createUser(
    actor: { userId: string; email?: string; role: string },
    input: {
      name: string;
      email: string;
      password?: string;
      role?: string;
      status?: AccountStatus;
    },
    meta?: { ip?: string; userAgent?: string }
  ) {
    const actorRole = normalizeRole(actor.role);
    const email = String(input.email || "").trim().toLowerCase();
    const name = String(input.name || "").trim();
    if (!name || name.length < 2) throw new BadRequestError("Name is required");
    if (!email || !/^\S+@\S+\.\S+$/.test(email)) {
      throw new BadRequestError("Valid email is required");
    }

    const nextRole = normalizeRole(input.role || "user");
    if (
      (nextRole === "admin" || nextRole === "super_admin") &&
      actorRole !== "super_admin"
    ) {
      throw new ForbiddenError(
        "Only Super Admin can create Admin or Super Admin accounts"
      );
    }

    const existing = await User.findOne({ email });
    if (existing) throw new BadRequestError("Email is already registered");

    const crypto = await import("crypto");
    const temporaryPassword =
      input.password && input.password.length >= 8
        ? input.password
        : `Tmp-${crypto.randomBytes(9).toString("base64url")}!a1`;

    const status = (input.status || "active") as AccountStatus;
    if (!["active", "suspended", "banned"].includes(status)) {
      throw new BadRequestError("Invalid status");
    }

    const user = await User.create({
      name,
      email,
      password: temporaryPassword,
      role: nextRole,
      status,
      isEmailVerified: true,
      mustChangePassword: !input.password || input.password.length < 8,
    });

    await writeAdminAudit({
      actorId: actor.userId,
      actorEmail: actor.email,
      action: "user.create",
      resource: "user",
      resourceId: user._id.toString(),
      after: { email, role: nextRole, status },
      ip: meta?.ip,
      userAgent: meta?.userAgent,
    });

    return {
      user: publicUser(user),
      // Returned once — never stored in audit or later GETs
      temporaryPassword: user.mustChangePassword ? temporaryPassword : undefined,
    };
  }

  async softDeleteUser(
    actor: { userId: string; email?: string; role: string },
    targetId: string,
    meta?: { ip?: string; userAgent?: string }
  ) {
    if (actor.userId === targetId) {
      throw new BadRequestError("You cannot delete your own account");
    }
    const target = await User.findById(targetId);
    if (!target) throw new NotFoundError("User not found");
    if (target.deletedAt) throw new BadRequestError("User already deleted");

    const actorRole = normalizeRole(actor.role);
    const targetRole = normalizeRole(target.role);
    if (targetRole === "super_admin" && actorRole !== "super_admin") {
      throw new ForbiddenError("Only Super Admin can delete Super Admin accounts");
    }

    target.deletedAt = new Date();
    target.status = "banned";
    await target.save();
    await sessionRepository.deleteByUser(targetId);

    await writeAdminAudit({
      actorId: actor.userId,
      actorEmail: actor.email,
      action: "user.soft_delete",
      resource: "user",
      resourceId: targetId,
      before: { role: targetRole, status: target.status },
      after: { deletedAt: target.deletedAt },
      ip: meta?.ip,
      userAgent: meta?.userAgent,
    });

    return publicUser(target);
  }

  async resetPassword(
    actor: { userId: string; email?: string; role: string },
    targetId: string,
    options?: { temporaryPassword?: string },
    meta?: { ip?: string; userAgent?: string }
  ) {
    const target = await User.findById(targetId).select("+password");
    if (!target || target.deletedAt) throw new NotFoundError("User not found");

    const actorRole = normalizeRole(actor.role);
    const targetRole = normalizeRole(target.role);
    if (targetRole === "super_admin" && actorRole !== "super_admin") {
      throw new ForbiddenError(
        "Only Super Admin can reset Super Admin passwords"
      );
    }

    const crypto = await import("crypto");
    const temporaryPassword =
      options?.temporaryPassword && options.temporaryPassword.length >= 8
        ? options.temporaryPassword
        : `Tmp-${crypto.randomBytes(9).toString("base64url")}!a1`;

    target.password = temporaryPassword;
    target.mustChangePassword = true;
    await target.save();
    await sessionRepository.deleteByUser(targetId);

    await writeAdminAudit({
      actorId: actor.userId,
      actorEmail: actor.email,
      action: "user.password_reset",
      resource: "user",
      resourceId: targetId,
      after: { mustChangePassword: true },
      ip: meta?.ip,
      userAgent: meta?.userAgent,
    });

    return {
      user: publicUser(target),
      temporaryPassword,
    };
  }

  async getUserActivity(
    targetId: string,
    query: { page?: number; limit?: number }
  ) {
    const user = await User.findById(targetId).lean();
    if (!user) throw new NotFoundError("User not found");

    const page = Math.max(1, query.page || 1);
    const limit = Math.min(100, Math.max(1, query.limit || 30));
    const { SecurityLog } = await import("../models/securityLog.model");

    const [secLogs, auditAsTarget, auditAsActor] = await Promise.all([
      SecurityLog.find({ userId: targetId })
        .sort({ createdAt: -1 })
        .limit(200)
        .lean(),
      AdminAuditLog.find({ resource: "user", resourceId: targetId })
        .sort({ createdAt: -1 })
        .limit(100)
        .lean(),
      AdminAuditLog.find({ actorId: targetId })
        .sort({ createdAt: -1 })
        .limit(100)
        .lean(),
    ]);

    type ActivityItem = {
      id: string;
      type: string;
      action: string;
      detail?: string;
      ip?: string;
      createdAt: Date | string;
    };

    const items: ActivityItem[] = [];

    for (const s of secLogs) {
      items.push({
        id: `sec-${s._id}`,
        type: "security",
        action: String(s.action),
        ip: s.ip,
        createdAt: (s as any).createdAt,
      });
    }
    for (const a of auditAsTarget) {
      items.push({
        id: `aud-t-${a._id}`,
        type: "account",
        action: String(a.action),
        detail: a.actorEmail ? `by ${a.actorEmail}` : undefined,
        ip: a.ip,
        createdAt: (a as any).createdAt,
      });
    }
    for (const a of auditAsActor) {
      items.push({
        id: `aud-a-${a._id}`,
        type: "admin_action",
        action: String(a.action),
        detail: `${a.resource}${a.resourceId ? `:${a.resourceId}` : ""}`,
        ip: a.ip,
        createdAt: (a as any).createdAt,
      });
    }

    items.sort(
      (a, b) =>
        new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    );

    const total = items.length;
    const slice = items.slice((page - 1) * limit, page * limit);

    return {
      activity: slice,
      meta: {
        total,
        page,
        limit,
        totalPages: Math.max(1, Math.ceil(total / limit)),
      },
    };
  }

  async getUserProgress(
    targetId: string,
    authHeader?: string
  ) {
    const user = await User.findById(targetId).lean();
    if (!user) throw new NotFoundError("User not found");

    const { serverConfig } = await import("../config");
    let submissions: any[] = [];
    try {
      const axios = (await import("axios")).default;
      const res = await axios.get(
        `${serverConfig.SUBMISSION_SERVICE}/submissions/user/${targetId}`,
        {
          timeout: 8000,
          headers: authHeader ? { Authorization: authHeader } : {},
        }
      );
      submissions = Array.isArray(res.data?.data) ? res.data.data : [];
    } catch {
      submissions = [];
    }

    const submitOnly = submissions.filter(
      (s) => !s.source || s.source === "submit"
    );
    const accepted = submitOnly.filter((s) => s.status === "ACCEPTED");
    const solvedProblemIds = [
      ...new Set(accepted.map((s) => String(s.problemId))),
    ];
    const attemptedProblemIds = [
      ...new Set(submitOnly.map((s) => String(s.problemId))),
    ];

    const byLanguage: Record<string, number> = {};
    for (const s of submitOnly) {
      const lang = String(s.language || "unknown");
      byLanguage[lang] = (byLanguage[lang] || 0) + 1;
    }

    const acceptanceRate =
      submitOnly.length > 0
        ? Math.round((accepted.length / submitOnly.length) * 1000) / 10
        : 0;

    return {
      userId: targetId,
      submissionCount: submitOnly.length,
      acceptedCount: accepted.length,
      acceptanceRate,
      problemsAttempted: attemptedProblemIds.length,
      problemsSolved: solvedProblemIds.length,
      // Difficulty breakdown requires ProblemService — filled when available
      easySolved: null as number | null,
      mediumSolved: null as number | null,
      hardSolved: null as number | null,
      byLanguage,
      recentSolved: accepted.slice(0, 10).map((s) => ({
        id: s.id || s._id,
        problemId: s.problemId,
        language: s.language,
        createdAt: s.createdAt,
      })),
      recentSubmissions: submitOnly.slice(0, 15).map((s) => ({
        id: s.id || s._id,
        problemId: s.problemId,
        status: s.status,
        language: s.language,
        createdAt: s.createdAt,
      })),
    };
  }

  async listUserSessions(targetId: string) {
    const user = await User.findById(targetId).lean();
    if (!user) throw new NotFoundError("User not found");

    const sessions = await sessionRepository.findByUser(targetId);
    const now = Date.now();
    return {
      sessions: (sessions as any[]).map((s) => ({
        id: s._id?.toString?.() || s.id,
        ip: s.ip || null,
        userAgent: s.userAgent || null,
        createdAt: s.createdAt,
        expiresAt: s.expiresAt,
        expired: s.expiresAt ? new Date(s.expiresAt).getTime() < now : false,
      })),
    };
  }

  async revokeUserSession(
    actor: { userId: string; email?: string; role: string },
    targetId: string,
    sessionId: string,
    meta?: { ip?: string; userAgent?: string }
  ) {
    const user = await User.findById(targetId);
    if (!user) throw new NotFoundError("User not found");

    const result = await sessionRepository.deleteById(sessionId, targetId);
    if (!result.deletedCount) throw new NotFoundError("Session not found");

    await writeAdminAudit({
      actorId: actor.userId,
      actorEmail: actor.email,
      action: "user.session_revoke",
      resource: "user",
      resourceId: targetId,
      after: { sessionId },
      ip: meta?.ip,
      userAgent: meta?.userAgent,
    });

    return { revoked: true };
  }

  async revokeAllUserSessions(
    actor: { userId: string; email?: string; role: string },
    targetId: string,
    meta?: { ip?: string; userAgent?: string }
  ) {
    const user = await User.findById(targetId);
    if (!user) throw new NotFoundError("User not found");

    await sessionRepository.deleteByUser(targetId);

    await writeAdminAudit({
      actorId: actor.userId,
      actorEmail: actor.email,
      action: "user.session_revoke_all",
      resource: "user",
      resourceId: targetId,
      ip: meta?.ip,
      userAgent: meta?.userAgent,
    });

    return { revoked: true };
  }
}

export const adminUserService = new AdminUserService();
