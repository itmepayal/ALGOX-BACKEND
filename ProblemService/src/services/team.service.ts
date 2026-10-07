import { Types } from "mongoose";
import "../models/user.model";
import { Team, ITeam } from "../models/team.model";
import { TeamMember, TeamRole } from "../models/teamMember.model";
import { TeamInvitation } from "../models/teamInvitation.model";



import { emitRealtimeEvent } from "../utils/helpers/realtimeEmit";
import {
  BadRequestError,
  ForbiddenError,
  NotFoundError,
  ConflictError,
} from "../utils/errors/app.error";

export const MAX_TEAM_MEMBERS = 10;
const INVITATION_EXPIRY_DAYS = 7;

function slugify(name: string): string {
  return name
    .toLowerCase()
    .trim()
    .replace(/[^\w\s-]/g, "")
    .replace(/[\s_-]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export class TeamService {
  /**
   * Create a new team with owner as first member (role = OWNER).
   */
  async createTeam(ownerId: string, name: string, description = ""): Promise<ITeam> {
    if (!name || name.trim().length < 3) {
      throw new BadRequestError("Team name must be at least 3 characters long");
    }

    const trimmedName = name.trim();
    const slug = slugify(trimmedName);

    // Check name / slug uniqueness
    const existing = await Team.findOne({
      $or: [{ name: trimmedName }, { slug }],
    }).lean();
    if (existing) {
      throw new ConflictError("A team with this name already exists");
    }

    // Check if user is already an owner/member of an active team
    const existingMembership = await TeamMember.findOne({
      userId: new Types.ObjectId(ownerId),
    }).lean();

    if (existingMembership) {
      const activeTeam = await Team.findOne({
        _id: existingMembership.teamId,
        status: "ACTIVE",
      }).lean();

      if (activeTeam) {
        throw new ConflictError("You are already a member of an active team. Leave your team first.");
      }
    }

    // Create Team
    const team = await Team.create({
      name: trimmedName,
      slug,
      description: description.trim(),
      ownerId: new Types.ObjectId(ownerId),
      status: "ACTIVE",
      maxMembers: MAX_TEAM_MEMBERS,
      rating: 1200,
      peakRating: 1200,
      wins: 0,
      losses: 0,
      draws: 0,
      matches: 0,
    });

    // Create TeamMember for owner
    await TeamMember.create({
      teamId: team._id,
      userId: new Types.ObjectId(ownerId),
      role: "OWNER",
      joinedAt: new Date(),
    });

    return team;
  }

  /**
   * Get team by ID including members list.
   */
  async getTeamById(teamId: string) {
    if (!Types.ObjectId.isValid(teamId)) {
      throw new BadRequestError("Invalid teamId format");
    }

    const team = await Team.findById(teamId).lean();
    if (!team || team.status === "DISBANDED") {
      throw new NotFoundError("Team not found or has been disbanded");
    }

    const members = await TeamMember.find({ teamId: team._id })
      .populate("userId", "username email name avatar")
      .sort({ joinedAt: 1 })
      .lean();

    return {
      ...team,
      members: members.map((m: any) => ({
        id: m._id.toString(),
        userId: m.userId?._id?.toString() || m.userId?.toString(),
        username: m.userId?.username || m.userId?.name || "Member",
        email: m.userId?.email,
        avatar: m.userId?.avatar,
        role: m.role,
        joinedAt: m.joinedAt,
      })),
      memberCount: members.length,
    };
  }

  /**
   * Get current team for a given user.
   */
  async getUserTeam(userId: string) {
    const membership = await TeamMember.findOne({
      userId: new Types.ObjectId(userId),
    }).lean();

    if (!membership) {
      return null;
    }

    return this.getTeamById(membership.teamId.toString());
  }

  /**
   * Invite a user to join the team (only OWNER or CAPTAIN can invite).
   */
  async inviteUser(teamId: string, inviterUserId: string, targetUserId: string) {
    if (!Types.ObjectId.isValid(teamId) || !Types.ObjectId.isValid(targetUserId)) {
      throw new BadRequestError("Invalid IDs provided");
    }

    // Check inviter role
    const inviterMember = await TeamMember.findOne({
      teamId: new Types.ObjectId(teamId),
      userId: new Types.ObjectId(inviterUserId),
    }).lean();

    if (!inviterMember || (inviterMember.role !== "OWNER" && inviterMember.role !== "CAPTAIN")) {
      throw new ForbiddenError("Only team Owner or Captains can invite new members");
    }

    // Check current member count
    const memberCount = await TeamMember.countDocuments({
      teamId: new Types.ObjectId(teamId),
    });
    if (memberCount >= MAX_TEAM_MEMBERS) {
      throw new ConflictError(`Team has reached maximum limit of ${MAX_TEAM_MEMBERS} members`);
    }

    // Check if target user is already a member
    const existingMember = await TeamMember.findOne({
      teamId: new Types.ObjectId(teamId),
      userId: new Types.ObjectId(targetUserId),
    }).lean();
    if (existingMember) {
      throw new ConflictError("User is already a member of this team");
    }

    // Check for active pending invitation
    const existingInvite = await TeamInvitation.findOne({
      teamId: new Types.ObjectId(teamId),
      invitedUserId: new Types.ObjectId(targetUserId),
      status: "PENDING",
      expiresAt: { $gt: new Date() },
    }).lean();

    if (existingInvite) {
      throw new ConflictError("A pending invitation has already been sent to this user");
    }

    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + INVITATION_EXPIRY_DAYS);

    const invitation = await TeamInvitation.create({
      teamId: new Types.ObjectId(teamId),
      invitedUserId: new Types.ObjectId(targetUserId),
      invitedBy: new Types.ObjectId(inviterUserId),
      status: "PENDING",
      expiresAt,
    });

    emitRealtimeEvent({
      event: "team:invitation",
      room: `user:${targetUserId}`,
      payload: {
        invitationId: invitation._id.toString(),
        teamId,
        invitedBy: inviterUserId,
      },
    });

    return invitation;
  }

  /**
   * List pending invitations for current user.
   */
  async getUserInvitations(userId: string) {
    const invites = await TeamInvitation.find({
      invitedUserId: new Types.ObjectId(userId),
      status: "PENDING",
      expiresAt: { $gt: new Date() },
    })
      .populate("teamId", "name slug description rating")
      .populate("invitedBy", "username email name")
      .sort({ createdAt: -1 })
      .lean();

    return invites.map((inv: any) => ({
      id: inv._id.toString(),
      team: inv.teamId,
      invitedBy: inv.invitedBy,
      expiresAt: inv.expiresAt,
      createdAt: inv.createdAt,
    }));
  }

  /**
   * Accept an invitation.
   */
  async acceptInvitation(userId: string, invitationId: string) {
    if (!Types.ObjectId.isValid(invitationId)) {
      throw new BadRequestError("Invalid invitationId format");
    }

    const invite = await TeamInvitation.findById(invitationId);
    if (!invite || invite.status !== "PENDING") {
      throw new NotFoundError("Pending invitation not found");
    }

    if (invite.invitedUserId.toString() !== userId) {
      throw new ForbiddenError("This invitation was sent to another user");
    }

    if (invite.expiresAt < new Date()) {
      invite.status = "EXPIRED";
      await invite.save();
      throw new BadRequestError("Invitation has expired");
    }

    // Check team capacity
    const memberCount = await TeamMember.countDocuments({ teamId: invite.teamId });
    if (memberCount >= MAX_TEAM_MEMBERS) {
      throw new ConflictError("Team is currently full");
    }

    // Remove any existing team membership for user before joining
    await TeamMember.deleteMany({ userId: new Types.ObjectId(userId) });

    // Update invitation state & create membership
    invite.status = "ACCEPTED";
    await invite.save();

    await TeamMember.create({
      teamId: invite.teamId,
      userId: new Types.ObjectId(userId),
      role: "MEMBER",
      joinedAt: new Date(),
    });

    emitRealtimeEvent({
      event: "team:member_joined",
      room: `team:${invite.teamId.toString()}`,
      payload: {
        teamId: invite.teamId.toString(),
        userId,
      },
    });

    return this.getTeamById(invite.teamId.toString());
  }

  /**
   * Reject an invitation.
   */
  async rejectInvitation(userId: string, invitationId: string) {
    if (!Types.ObjectId.isValid(invitationId)) {
      throw new BadRequestError("Invalid invitationId format");
    }

    const invite = await TeamInvitation.findById(invitationId);
    if (!invite || invite.status !== "PENDING") {
      throw new NotFoundError("Pending invitation not found");
    }

    if (invite.invitedUserId.toString() !== userId) {
      throw new ForbiddenError("This invitation was sent to another user");
    }

    invite.status = "REJECTED";
    await invite.save();

    return { message: "Invitation rejected" };
  }

  /**
   * Leave team.
   */
  async leaveTeam(userId: string, teamId: string) {
    const member = await TeamMember.findOne({
      teamId: new Types.ObjectId(teamId),
      userId: new Types.ObjectId(userId),
    });

    if (!member) {
      throw new NotFoundError("You are not a member of this team");
    }

    if (member.role === "OWNER") {
      const otherMembers = await TeamMember.countDocuments({
        teamId: new Types.ObjectId(teamId),
        userId: { $ne: new Types.ObjectId(userId) },
      });

      if (otherMembers > 0) {
        throw new BadRequestError(
          "As the Team Owner, you must transfer ownership to another member before leaving."
        );
      } else {
        // Disband team if last member leaves
        await Team.findByIdAndUpdate(teamId, { status: "DISBANDED" });
      }
    }

    await TeamMember.deleteOne({ _id: member._id });

    emitRealtimeEvent({
      event: "team:member_left",
      room: `team:${teamId}`,
      payload: {
        teamId,
        userId,
      },
    });

    return { message: "Left team successfully" };
  }

  /**
   * Remove member from team (Owner can remove anyone, Captain can remove Members).
   */
  async removeMember(requesterUserId: string, teamId: string, targetUserId: string) {
    const requester = await TeamMember.findOne({
      teamId: new Types.ObjectId(teamId),
      userId: new Types.ObjectId(requesterUserId),
    }).lean();

    if (!requester || (requester.role !== "OWNER" && requester.role !== "CAPTAIN")) {
      throw new ForbiddenError("Only team Owner or Captains can remove members");
    }

    const target = await TeamMember.findOne({
      teamId: new Types.ObjectId(teamId),
      userId: new Types.ObjectId(targetUserId),
    }).lean();

    if (!target) {
      throw new NotFoundError("Target member not found in this team");
    }

    if (target.role === "OWNER") {
      throw new ForbiddenError("Cannot remove the Team Owner");
    }

    if (requester.role === "CAPTAIN" && target.role === "CAPTAIN") {
      throw new ForbiddenError("Captains cannot remove other Captains");
    }

    await TeamMember.deleteOne({ _id: target._id });

    emitRealtimeEvent({
      event: "team:member_left",
      room: `team:${teamId}`,
      payload: {
        teamId,
        userId: targetUserId,
        removedBy: requesterUserId,
      },
    });

    return { message: "Member removed from team" };
  }

  /**
   * Update member role (Owner only).
   */
  async updateMemberRole(
    ownerUserId: string,
    teamId: string,
    targetUserId: string,
    newRole: TeamRole
  ) {
    const owner = await TeamMember.findOne({
      teamId: new Types.ObjectId(teamId),
      userId: new Types.ObjectId(ownerUserId),
    }).lean();

    if (!owner || owner.role !== "OWNER") {
      throw new ForbiddenError("Only the Team Owner can modify member roles");
    }

    if (newRole === "OWNER") {
      throw new BadRequestError("Use transferOwnership to assign a new Owner");
    }

    const target = await TeamMember.findOne({
      teamId: new Types.ObjectId(teamId),
      userId: new Types.ObjectId(targetUserId),
    });

    if (!target) {
      throw new NotFoundError("Target member not found");
    }

    target.role = newRole;
    await target.save();

    return { message: `Updated role to ${newRole}` };
  }

  /**
   * Transfer ownership to another member.
   */
  async transferOwnership(ownerUserId: string, teamId: string, newOwnerUserId: string) {
    const owner = await TeamMember.findOne({
      teamId: new Types.ObjectId(teamId),
      userId: new Types.ObjectId(ownerUserId),
    });

    if (!owner || owner.role !== "OWNER") {
      throw new ForbiddenError("Only the Team Owner can transfer ownership");
    }

    const newOwner = await TeamMember.findOne({
      teamId: new Types.ObjectId(teamId),
      userId: new Types.ObjectId(newOwnerUserId),
    });

    if (!newOwner) {
      throw new NotFoundError("Target user is not a member of this team");
    }

    // Update Team ownerId
    await Team.findByIdAndUpdate(teamId, { ownerId: new Types.ObjectId(newOwnerUserId) });

    // Update roles
    owner.role = "CAPTAIN";
    await owner.save();

    newOwner.role = "OWNER";
    await newOwner.save();

    return { message: "Ownership transferred successfully" };
  }
}

export const teamService = new TeamService();
