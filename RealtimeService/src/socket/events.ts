/**
 * Centralized Socket.IO / realtime event name registry.
 * Keep names stable — clients and other services emit/listen against these.
 */
export const RealtimeEvents = {
  // Connection / presence
  CONNECTION: "connection",
  DISCONNECT: "disconnect",
  FORCE_DISCONNECT: "system.force_disconnect",

  // Client → server
  PRESENCE_UPDATE: "user.presence.update",
  PRESENCE_GET: "presence:get",
  ROOM_JOIN: "room.join",
  ROOM_LEAVE: "room.leave",
  HEARTBEAT: "user.heartbeat",
  CODING_CREATE: "coding:session:create",
  CODING_JOIN: "coding:session:join",
  CODING_UPDATE: "coding:session:update",
  CODING_STATE: "coding:session:state",
  CODING_COMPLETE: "coding:session:complete",
  CODING_CONTROL: "coding:session:control",
  CODING_CURSOR: "coding:session:cursor",
  CODING_CURSOR_STATE: "coding:session:cursor-state",

  // Server → client presence broadcast (unique online users)
  PRESENCE_COUNT: "presence:count",

  // user.*
  USER_ONLINE: "user.online",
  USER_OFFLINE: "user.offline",
  USER_IDLE: "user.idle",
  USER_RECONNECTING: "user.reconnecting",
  USER_PROFILE_UPDATED: "user.profile.updated",
  USER_STATUS_CHANGED: "user.status.changed",

  // submission.*
  SUBMISSION_CREATED: "submission.created",
  SUBMISSION_QUEUED: "submission.queued",
  SUBMISSION_RUNNING: "submission.running",
  SUBMISSION_COMPLETED: "submission.completed",
  SUBMISSION_FAILED: "submission.failed",
  SUBMISSION_UPDATED: "submission.updated",

  // execution.*
  EXECUTION_STARTED: "execution.started",
  EXECUTION_PROGRESS: "execution.progress",
  EXECUTION_COMPLETED: "execution.completed",
  EXECUTION_FAILED: "execution.failed",
  EXECUTION_TIMEOUT: "execution.timeout",

  // worker.*
  WORKER_HEARTBEAT: "worker.heartbeat",
  WORKER_BUSY: "worker.busy",
  WORKER_IDLE: "worker.idle",
  WORKER_ERROR: "worker.error",

  // contest.*
  CONTEST_STARTED: "contest.started",
  CONTEST_ENDED: "contest.ended",
  CONTEST_STATUS_CHANGED: "contest.status_changed",

  // leaderboard / notifications / announcements
  LEADERBOARD_UPDATED: "leaderboard.updated",
  NOTIFICATION_CREATED: "notification.created",
  ANNOUNCEMENT_PUBLISHED: "announcement.published",

  // system.*
  SYSTEM_MAINTENANCE: "system.maintenance",
  SYSTEM_BROADCAST: "system.broadcast",
  SYSTEM_HEALTH: "system.health",
  SYSTEM_FORCE_DISCONNECT: "system.force_disconnect",

  // security.*
  SECURITY_ALERT: "security.alert",
  SECURITY_RATE_LIMIT: "security.rate_limit",
  SECURITY_SUSPICIOUS: "security.suspicious",

  // battle:*
  BATTLE_INVITE: "battle:invite",
  BATTLE_ACCEPTED: "battle:accepted",
  BATTLE_DECLINED: "battle:declined",
  BATTLE_READY: "battle:ready",
  BATTLE_STARTED: "battle:started",
  BATTLE_TIMER_SYNC: "battle:timer_sync",
  BATTLE_PROBLEM_SOLVED: "battle:problem_solved",
  BATTLE_SUBMISSION_RESULT: "battle:submission_result",
  BATTLE_OPPONENT_STATUS: "battle:opponent_status",
  BATTLE_FINISHED: "battle:finished",
  BATTLE_RESULT: "battle:result",
  BATTLE_FORFEIT: "battle:forfeit",

  // team:*
  TEAM_INVITATION: "team:invitation",
  TEAM_MEMBER_JOINED: "team:member_joined",
  TEAM_MEMBER_LEFT: "team:member_left",
  TEAM_BATTLE_CREATED: "team:battle_created",
  TEAM_BATTLE_ACCEPTED: "team:battle_accepted",
  TEAM_BATTLE_STARTED: "team:battle_started",
  TEAM_BATTLE_STATE: "team:battle_state",
  TEAM_MEMBER_STATUS: "team:member_status",
  TEAM_SUBMISSION_STATUS: "team:submission_status",
  TEAM_BATTLE_ENDED: "team:battle_ended",
  TEAM_RATING_UPDATED: "team:rating_updated",
} as const;

export type RealtimeEventName =
  (typeof RealtimeEvents)[keyof typeof RealtimeEvents];

export const KNOWN_EVENT_NAMES: string[] = Object.values(RealtimeEvents);
