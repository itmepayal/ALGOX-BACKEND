export const HTTP_STATUS = {
  OK: 200,
  CREATED: 201,
  BAD_REQUEST: 400,
  UNAUTHORIZED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  INTERNAL_SERVER_ERROR: 500,
} as const;

export const REALTIME_MESSAGES = {
  SERVICE_HEALTHY: "RealtimeService is healthy",
  OVERVIEW_OK: "Realtime overview retrieved",
  USERS_OK: "Live users retrieved",
  CONNECTIONS_OK: "Connections retrieved",
  ROOMS_OK: "Rooms retrieved",
  EVENTS_OK: "Event stream retrieved",
  ANALYTICS_OK: "Realtime analytics retrieved",
  BROADCAST_OK: "Broadcast queued",
  DISCONNECT_OK: "Connection force-disconnected",
  DISCONNECT_NOT_FOUND: "Connection not found",
} as const;
