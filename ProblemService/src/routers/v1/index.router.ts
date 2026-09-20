import express from 'express';
import problemRouter from './problem.router';
import progressRouter from './progress.router';
import learningRouter, { mountLearningInternal } from './learning.router';
import challengeRouter, { mountChallengeInternal } from './challenge.router';
import mockInterviewRouter, {
  mountMockInterviewInternal,
} from './mockInterview.router';
import srsRouter, { mountSrsInternal } from './srs.router';
import virtualContestRouter, {
  mountVirtualContestInternal,
} from './virtualContest.router';
import aiRouter from './ai.router';
import codeAnalysisRouter from './codeAnalysis.router';
import adminSheetRouter from './adminSheet.router';
import adminContestRouter from './adminContest.router';
import adminLearningRouter from './adminLearning.router';
import adminMockInterviewRouter from './adminMockInterview.router';
import contestRouter from './contest.router';
import sheetPublicRouter from './sheetPublic.router';
import { sendResponse } from '../../utils/helpers/response.helper';
import { HTTP_STATUS, PROBLEM_MESSAGES } from '../../utils/constants';
import { blockWhenMaintenance } from '../../middlewares/featureFlag.middleware';
import { requireInternalSecret } from '../../middlewares/auth.middleware';
import { invalidateFeatureFlagsCache } from '../../utils/featureFlags';

const v1Router = express.Router();

v1Router.get('/health', (req, res) => {
  sendResponse({
    res,
    statusCode: HTTP_STATUS.OK,
    message: PROBLEM_MESSAGES.SERVICE_HEALTHY,
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

mountChallengeInternal(v1Router);
mountMockInterviewInternal(v1Router);
mountSrsInternal(v1Router);
mountVirtualContestInternal(v1Router);
mountLearningInternal(v1Router);

v1Router.use(blockWhenMaintenance);

v1Router.use('/problems', problemRouter);
v1Router.use('/progress', progressRouter);
v1Router.use('/learning', learningRouter);
v1Router.use('/challenges', challengeRouter);
v1Router.use('/interviews', mockInterviewRouter);
v1Router.use('/reviews', srsRouter);
v1Router.use('/virtual-contests', virtualContestRouter);
v1Router.use('/ai', aiRouter);
v1Router.use('/code-analysis', codeAnalysisRouter);
v1Router.use('/sheets', sheetPublicRouter);
v1Router.use('/admin/sheets', adminSheetRouter);
v1Router.use('/admin/contests', adminContestRouter);
v1Router.use('/admin/learning', adminLearningRouter);
v1Router.use('/admin/interviews', adminMockInterviewRouter);
v1Router.use('/contests', contestRouter);

export default v1Router;
