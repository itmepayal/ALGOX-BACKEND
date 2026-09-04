import express from 'express';
import submissionRouter from './submission.router';
import { sendResponse } from '../../utils/helpers/response.helper';
import { HTTP_STATUS, SUBMISSION_MESSAGES } from '../../utils/constants';

const v1Router = express.Router();

v1Router.get('/health', (req, res) => {
  sendResponse({
    res,
    statusCode: HTTP_STATUS.OK,
    message: SUBMISSION_MESSAGES.SERVICE_HEALTHY,
  });
});

v1Router.use('/submissions', submissionRouter);

export default v1Router;
