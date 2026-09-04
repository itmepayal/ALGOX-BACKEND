import { Request, Response, NextFunction } from "express";
import {
  runCodeSchema,
  evaluateSubmissionSchema,
} from "../validators/evaluation.validator";
import { runCodeInDocker } from "../utils/containers/codeRunner.util";
import { EvaluationService } from "../services/evaluation.service";
import { sendResponse } from "../utils/helpers/response.helper";
import { HTTP_STATUS, EVALUATION_MESSAGES } from "../utils/constants";

const evaluationService = new EvaluationService();

export class EvaluationController {
  async runCode(
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> {
    try {
      const validated = runCodeSchema.parse(req.body);

      const result = await runCodeInDocker({
        code: validated.code,
        language: validated.language,
        input: validated.input,
        timeLimitMs: validated.timeLimitMs,
        memoryLimitMb: validated.memoryLimitMb,
      });

      sendResponse({
        res,
        statusCode: HTTP_STATUS.OK,
        message: EVALUATION_MESSAGES.CODE_EXECUTED_SUCCESS,
        data: {
          stdout: result.stdout,
          stderr: result.stderr,
          exitCode: result.exitCode,
          executionTimeMs: result.timeMs,
          memoryMb: result.memoryMb,
          timedOut: result.timedOut,
        },
      });
    } catch (error) {
      next(error);
    }
  }

  async evaluateSubmission(
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> {
    try {
      const validated = evaluateSubmissionSchema.parse(req.body);

      const result = await evaluationService.evaluateSubmission(validated);

      sendResponse({
        res,
        statusCode: HTTP_STATUS.OK,
        message: EVALUATION_MESSAGES.SUBMISSION_EVALUATED_SUCCESS,
        data: result,
      });
    } catch (error) {
      next(error);
    }
  }
}

