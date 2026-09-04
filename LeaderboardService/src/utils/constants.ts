export const HTTP_STATUS = {
  OK: 200,
  CREATED: 201,
  BAD_REQUEST: 400,
  NOT_FOUND: 404,
  INTERNAL_SERVER_ERROR: 500,
} as const;

export const LEADERBOARD_MESSAGES = {
  LEADERBOARD_RETRIEVED: "Global leaderboard retrieved successfully",
  USER_STATS_RETRIEVED: "User stats retrieved successfully",
  STATS_UPDATED: "User stats updated successfully",
  SERVICE_HEALTHY: "LeaderboardService is healthy",
} as const;
