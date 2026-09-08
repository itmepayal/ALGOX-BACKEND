import express from 'express';
import cookieParser from 'cookie-parser';
import { serverConfig } from './config';
import { connectDB } from './config/db.config';
import v1Router from './routers/v1/index.router';
import v2Router from './routers/v2/index.router';
import { errorHandler } from './middlewares/error.middleware';
import logger from './config/logger.config';
import { attachCorrelationIdMiddleware } from './middlewares/correlation.middleware';
import cors from 'cors';

const app = express();

app.use(cors({
    origin: true,
    credentials: true,
}));
app.use(express.json());
app.use(cookieParser());


app.use(attachCorrelationIdMiddleware);
app.use('/api/v1', v1Router);
app.use('/api/v2', v2Router);

app.use(errorHandler);

const startServer = async () => {
    try {
        await connectDB();
        app.listen(serverConfig.PORT, () => {
            logger.info(`Server is running on http://localhost:${serverConfig.PORT}`);
            logger.info(`Press Ctrl+C to stop the server.`);
        });
    } catch (error) {
        logger.error("Failed to start AuthService server:", error);
        process.exit(1);
    }
};

startServer();
