import express from 'express';
import problemRouter from './problem.router';
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

export default v1Router;
