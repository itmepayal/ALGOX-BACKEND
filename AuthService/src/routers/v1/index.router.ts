import express from 'express';
import authRouter from './auth.router';
import adminRouter from './admin.router';
import { sendResponse } from '../../utils/helpers/response.helper';
import { HTTP_STATUS } from '../../utils/constants';
import { blockWhenMaintenance } from '../../middlewares/featureFlag.middleware';

const v1Router = express.Router();

// Health check endpoint for load balancers and container orchestrators
v1Router.get('/health', (req, res) => {
  sendResponse({
    res,
    statusCode: HTTP_STATUS.OK,
    message: "AuthService is healthy",
  });
});

// Centralized maintenance gate (exempts health/admin/login/public settings)
v1Router.use(blockWhenMaintenance);

v1Router.use('/auth', authRouter);
v1Router.use('/auth/admin', adminRouter);

export default v1Router;