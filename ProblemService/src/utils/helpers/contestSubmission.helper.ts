import { Types } from "mongoose";
import { Contest, type ContestStatus } from "../../models/contest.model";
import { ContestParticipant } from "../../models/contestParticipant.model";
import { ContestProblem } from "../../models/contestProblem.model";
import {
  BadRequestError,
  ForbiddenError,
  NotFoundError,
} from "../errors/app.error";

/**
 * Ensures a contest currently accepts submissions (LIVE and within window)
 * and that the user is a registered participant.
 * Called by SubmissionService via GET .../allows-submission?userId=
 */
export async function assertContestAllowsSubmission(
  contestId: string | Types.ObjectId,
  userId?: string
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

  const uid = String(userId || "").trim();
  if (!uid) {
    throw new BadRequestError("userId is required for contest submissions");
  }

  const participant = await ContestParticipant.findOne({
    contestId: contest._id,
    userId: uid,
  }).lean();
  if (!participant) {
    throw new ForbiddenError("Register for the contest before submitting");
  }
}

export async function assertProblemBelongsToContest(
  contestId: string | Types.ObjectId,
  problemId: string
): Promise<void> {
  const cp = await ContestProblem.findOne({
    contestId: new Types.ObjectId(String(contestId)),
    problemId: new Types.ObjectId(String(problemId)),
  }).lean();
  if (!cp) {
    throw new BadRequestError("Problem is not part of this contest");
  }
}
