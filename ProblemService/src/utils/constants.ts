/**
 * Application Constants for ProblemService
 */

export const HTTP_STATUS = {
  OK: 200,
  CREATED: 201,
  BAD_REQUEST: 400,
  NOT_FOUND: 404,
  INTERNAL_SERVER_ERROR: 500,
} as const;

export const PROBLEM_MESSAGES = {
  PROBLEM_CREATED: "Problem created successfully",
  PROBLEM_RETRIEVED: "Problem retrieved successfully",
  PROBLEMS_RETRIEVED: "Problems retrieved successfully",
  PROBLEM_UPDATED: "Problem updated successfully",
  PROBLEM_DELETED: "Problem deleted successfully",
  PROBLEM_NOT_FOUND: "Problem not found",
  QUERY_REQUIRED: "Search query string is required",
  SERVICE_HEALTHY: "ProblemService is healthy",
} as const;

export const DEFAULT_PAGINATION = {
  PAGE: 1,
  LIMIT: 10,
} as const;
