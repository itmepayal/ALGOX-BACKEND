import { Types } from "mongoose";
import { Contest, type ContestStatus } from "../../models/contest.model";
import { BadRequestError, NotFoundError } from "../errors/app.error";

/**
 * Ensures a contest currently accepts submissions (LIVE and within window).
 * Called by SubmissionService via GET /api/v1/contests/internal/:contestId/allows-submission
 * when the submission payload includes `contestId`.
 */
export async function assertContestAllowsSubmission(
  contestId: string | Types.ObjectId
): Promise<void> {
  if (!Types.ObjectId.isValid(String(contestId))) {
    throw new BadRequestError("Invalid contestId");
  }

  const contest = await Contest.findById(contestId);
  if (!contest) {
    throw new NotFoundError("Contest not found");
  }

  const status = contest.status as ContestStatus;
  if (status !== "LIVE") {
    throw new BadRequestError(
      `Contest is not accepting submissions (status=${status})`
    );
  }

  const now = new Date();
  if (now < contest.startTime) {
    throw new BadRequestError("Contest has not started yet");
  }
  if (now > contest.endTime) {
    throw new BadRequestError("Contest submission window has ended");
  }
}
