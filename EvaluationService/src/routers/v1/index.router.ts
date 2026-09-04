import express from 'express';
import evaluationRouter from './evaluation.router';
import { sendResponse } from '../../utils/helpers/response.helper';
import { HTTP_STATUS, EVALUATION_MESSAGES } from '../../utils/constants';

const v1Router = express.Router();

v1Router.get('/health', (req, res) => {
    sendResponse({
        res,
        statusCode: HTTP_STATUS.OK,
        message: EVALUATION_MESSAGES.SERVICE_HEALTHY,
    });
});

v1Router.use('/evaluation', evaluationRouter);

export default v1Router;