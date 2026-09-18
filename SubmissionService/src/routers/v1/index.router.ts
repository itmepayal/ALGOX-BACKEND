import express from 'express';
import submissionRouter from './submission.router';
import suspiciousSubmissionRouter from './suspiciousSubmission.router';
import { sendResponse } from '../../utils/helpers/response.helper';
import { HTTP_STATUS, SUBMISSION_MESSAGES } from '../../utils/constants';
import { blockWhenMaintenance } from '../../middlewares/featureFlag.middleware';
import { requireInternalSecret } from '../../middlewares/auth.middleware';
import { invalidateFeatureFlagsCache } from '../../utils/featureFlags';
import {
  submissionQueue,
  getCachedQueueRedisSafety,
} from '../../queues/submission.queue';
import logger from '../../config/logger.config';

const v1Router = express.Router();

v1Router.get('/health', async (_req, res) => {
  let queue: Record<string, unknown> | null = null;
  let redisOk = false;
  try {
    const countsPromise = submissionQueue.getJobCounts(
      'waiting',
      'active',
      'completed',
      'failed',
      'delayed',
      'paused'
    );
    const timeoutPromise = new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error('Queue query timeout')), 2000)
    );
    const counts: any = await Promise.race([countsPromise, timeoutPromise]);
    redisOk = true;
    const waiting =
      Number(counts.waiting || 0) + Number(counts.delayed || 0);
    const active = Number(counts.active || 0);
    const failed = Number(counts.failed || 0);
    let status: 'healthy' | 'degraded' | 'unavailable' = 'healthy';
    if (waiting > 100 || failed > 50) status = 'degraded';
    const safety = getCachedQueueRedisSafety();
    queue = {
      ...counts,
      waiting,
      active,
      failed,
      status,
      evictionPolicy: safety?.policy ?? 'unknown',
      evictionSafe: safety?.ok ?? false,
    };
  } catch (err: any) {
    logger.warn('Submission health: queue metrics unavailable', {
      error: err?.message || err,
    });
    const safety = getCachedQueueRedisSafety();
    queue = {
      status: 'unavailable',
      error: 'Queue metrics unavailable',
      evictionPolicy: safety?.policy ?? 'unknown',
      evictionSafe: safety?.ok ?? false,
    };
  }

  sendResponse({
    res,
    statusCode: HTTP_STATUS.OK,
    message: SUBMISSION_MESSAGES.SERVICE_HEALTHY,
    data: {
      service: 'SubmissionService',
      redis: redisOk ? 'connected' : 'unavailable',
      queue,
    },
  });
});


v1Router.post(
  '/internal/feature-flags/invalidate',
  requireInternalSecret,
  (_req, res) => {
    invalidateFeatureFlagsCache();
    res.status(200).json({ success: true });
  }
);

v1Router.use(blockWhenMaintenance);

v1Router.use('/submissions', submissionRouter);
v1Router.use('/admin/suspicious-submissions', suspiciousSubmissionRouter);

export default v1Router;
