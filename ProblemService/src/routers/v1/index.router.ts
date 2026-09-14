import express from 'express';
import problemRouter from './problem.router';
import progressRouter from './progress.router';
import adminSheetRouter from './adminSheet.router';
import adminContestRouter from './adminContest.router';
import adminLearningRouter from './adminLearning.router';
import contestRouter from './contest.router';
import { sendResponse } from '../../utils/helpers/response.helper';
import { HTTP_STATUS, PROBLEM_MESSAGES } from '../../utils/constants';

const v1Router = express.Router();

v1Router.get('/health', (req, res) => {
  sendResponse({
    res,
    statusCode: HTTP_STATUS.OK,
    message: PROBLEM_MESSAGES.SERVICE_HEALTHY,
  });
});

v1Router.use('/problems', problemRouter);
v1Router.use('/progress', progressRouter);
v1Router.use('/admin/sheets', adminSheetRouter);
v1Router.use('/admin/contests', adminContestRouter);
v1Router.use('/admin/learning', adminLearningRouter);
v1Router.use('/contests', contestRouter);

export default v1Router;
