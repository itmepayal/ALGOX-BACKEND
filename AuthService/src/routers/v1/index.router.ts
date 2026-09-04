import express from 'express';
import authRouter from './auth.router';
import { sendResponse } from '../../utils/helpers/response.helper';
import { HTTP_STATUS } from '../../utils/constants';

const v1Router = express.Router();

// Health check endpoint for load balancers and container orchestrators
v1Router.get('/health', (req, res) => {
  sendResponse({
    res,
    statusCode: HTTP_STATUS.OK,
    message: "AuthService is healthy",
  });
});

v1Router.use('/auth', authRouter);

export default v1Router;