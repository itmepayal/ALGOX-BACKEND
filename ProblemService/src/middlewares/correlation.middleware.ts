import { NextFunction, Request, Response } from 'express';
import { v4 as uuidV4 } from 'uuid';
import { asyncLocalStorage } from '../utils/helpers/request.helpers';

export const attachCorrelationIdMiddleware = (req: Request, res: Response, next: NextFunction) => {
    const incomingId = req.headers['x-request-id'] || req.headers['x-correlation-id'];
    const correlationId = typeof incomingId === 'string' && /^[A-Za-z0-9._:-]{1,128}$/.test(incomingId)
        ? incomingId
        : uuidV4();
    req.headers['x-correlation-id'] = correlationId;
    res.setHeader('x-request-id', correlationId);
    res.setHeader('x-correlation-id', correlationId);

    asyncLocalStorage.run( { correlationId: correlationId } , () => {
        next();
    });
}
