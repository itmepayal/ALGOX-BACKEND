/**
 * Application Constants for SubmissionService
 */

export const HTTP_STATUS = {
  OK: 200,
  CREATED: 201,
  BAD_REQUEST: 400,
  NOT_FOUND: 404,
  INTERNAL_SERVER_ERROR: 500,
} as const;

export const SUBMISSION_MESSAGES = {
  SUBMISSION_CREATED: "Submission created and queued for evaluation",
  SUBMISSION_RETRIEVED: "Submission retrieved successfully",
  SUBMISSIONS_RETRIEVED: "Submissions retrieved successfully",
  SUBMISSION_UPDATED: "Submission updated successfully",
  SUBMISSION_DELETED: "Submission deleted successfully",
  SUBMISSION_NOT_FOUND: "Submission not found",
  MISSING_REQUIRED_FIELDS: "Missing required submission fields (problemId, code, language)",
  SERVICE_HEALTHY: "SubmissionService is healthy",
} as const;

export const DEFAULT_PAGINATION = {
  PAGE: 1,
  LIMIT: 10,
} as const;
