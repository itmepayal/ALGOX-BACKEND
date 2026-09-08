import logger from "../config/logger.config";
import { LeaderboardService } from "../services/leaderboard.service";

/**
 * Event-Driven Consumer Handler for Submission/Evaluation Events.
 * Listens to SUBMISSION_ACCEPTED events to update Leaderboard asynchronously without blocking HTTP requests.
 */
export class LeaderboardEventConsumer {
  constructor(private leaderboardService: LeaderboardService) {}

  async handleSubmissionAccepted(eventPayload: {
    userId: string;
    userName: string;
    userEmail: string;
    difficulty: "easy" | "medium" | "hard";
    submissionId?: string;
  }) {
    try {
      logger.info(
        `[EventConsumer] Processing SUBMISSION_ACCEPTED for User ${eventPayload.userId}`
      );

      await this.leaderboardService.recordSolvedProblem(
        eventPayload.userId,
        eventPayload.userName,
        eventPayload.userEmail,
        eventPayload.difficulty
      );

      logger.info(
        `[EventConsumer] Successfully updated leaderboard stats for User ${eventPayload.userId}`
      );
    } catch (error) {
      logger.error(
        `[EventConsumer] Error processing SUBMISSION_ACCEPTED event:`,
        error
      );
    }
  }
}
