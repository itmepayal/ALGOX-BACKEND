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
} as const;

export type RealtimeEventName =
  (typeof RealtimeEvents)[keyof typeof RealtimeEvents];

export const KNOWN_EVENT_NAMES: string[] = Object.values(RealtimeEvents);
