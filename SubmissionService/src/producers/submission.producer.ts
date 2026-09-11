import { IProblemDetails } from "../apis/problem.api";
import { ProgrammingLanguage } from "../models/submission.model";
import { submissionQueue } from "../queues/submission.queue";
import logger from "../config/logger.config";

export interface ISubmissionJob {
  submissionId: string;
  problemId?: string;
  problem: IProblemDetails;
  code: string;
  language: ProgrammingLanguage;
  /** Official suite from ProblemService internal API (includes isHidden). */
  testcases?: any[];
  timeLimitMs?: number;
  memoryLimitMb?: number;
  mode?: "submit";
  userId?: string;
}

export async function addSubmissionJob(submission: ISubmissionJob) {
  try {
    if (!submission?.submissionId || !submission?.code) {
      throw new Error("Invalid submission payload");
    }

    const job = await submissionQueue.add("evaluate-submission", submission);

    logger.info(`Submission job added: ${job.id}`, {
      submissionId: submission.submissionId,
      language: submission.language,
    });

    return job.id || null;
  } catch (error: any) {
    logger.error("Failed to add submission job", {
      error: error.message,
      submissionId: submission?.submissionId,
    });

    throw error;
  }
}
