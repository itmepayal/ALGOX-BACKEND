import express from "express";
import evaluationRouter from "./evaluation.router";
import { sendResponse } from "../../utils/helpers/response.helper";
import {
  HTTP_STATUS,
  EVALUATION_MESSAGES,
  DEFAULT_LIMITS,
} from "../../utils/constants";
import { submissionQueue } from "../../queues/submission.queue";
import logger from "../../config/logger.config";

const v1Router = express.Router();

v1Router.get("/health", async (_req, res) => {
  let queue: Record<string, unknown> | null = null;
  let redisOk = false;
  try {
    const counts = await submissionQueue.getJobCounts(
      "waiting",
      "active",
      "completed",
      "failed",
      "delayed",
      "paused"
    );
    redisOk = true;
    const waiting =
      Number(counts.waiting || 0) + Number(counts.delayed || 0);
    const active = Number(counts.active || 0);
    const failed = Number(counts.failed || 0);
    let status: "healthy" | "degraded" | "unavailable" = "healthy";
    if (waiting > 100 || failed > 50) status = "degraded";
    queue = {
      ...counts,
      waiting,
      active,
      failed,
      configuredWorkers: DEFAULT_LIMITS.CONCURRENCY_WORKERS,
      status,
    };
  } catch (err: any) {
    logger.warn("Evaluation health: queue metrics unavailable", {
      error: err?.message || err,
    });
    queue = {
      status: "unavailable",
      configuredWorkers: DEFAULT_LIMITS.CONCURRENCY_WORKERS,
      error: "Queue metrics unavailable",
    };
  }

  sendResponse({
    res,
    statusCode: HTTP_STATUS.OK,
    message: EVALUATION_MESSAGES.SERVICE_HEALTHY,
    data: {
      service: "EvaluationService",
      redis: redisOk ? "connected" : "unavailable",
      queue,
    },
  });
});

v1Router.use("/evaluation", evaluationRouter);

export default v1Router;
