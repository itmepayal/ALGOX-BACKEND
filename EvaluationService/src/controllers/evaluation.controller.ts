import { Request, Response, NextFunction } from "express";
import axios from "axios";
import {
  runCodeSchema,
  evaluateSubmissionSchema,
} from "../validators/evaluation.validator";
import { runCodeInDocker } from "../utils/containers/codeRunner.util";
import {
  EvaluationService,
  formatJudgeInput,
} from "../services/evaluation.service";
import { sendResponse } from "../utils/helpers/response.helper";
import { HTTP_STATUS, EVALUATION_MESSAGES } from "../utils/constants";
import { serverConfig } from "../config";
import logger from "../config/logger.config";

const evaluationService = new EvaluationService();

export class EvaluationController {
  async runCode(
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> {
    try {
      logger.info("RUN REQUEST RECEIVED", { path: req.path });
      logger.info("VALIDATION START");

      const validated = runCodeSchema.parse(req.body);
      logger.info("VALIDATION SUCCESS", {
        language: validated.language,
        inputType: typeof validated.input,
      });

      const stdin = formatJudgeInput(validated.input);
      logger.info("EXECUTION START", {
        language: validated.language,
        stdinPreview: stdin.slice(0, 120),
      });

      const result = await runCodeInDocker({
        code: validated.code,
        language: validated.language,
        input: stdin,
        timeLimitMs: validated.timeLimitMs,
        memoryLimitMb: validated.memoryLimitMb,
      });

      logger.info("EXECUTION RESULT", {
        exitCode: result.exitCode,
        timedOut: result.timedOut,
        stdoutPreview: result.stdout?.slice(0, 200),
      });

      sendResponse({
        res,
        statusCode: HTTP_STATUS.OK,
        message: EVALUATION_MESSAGES.CODE_EXECUTED_SUCCESS,
        data: {
          mode: "run",
          stdout: result.stdout,
          stderr: result.stderr,
          exitCode: result.exitCode,
          executionTimeMs: result.timeMs,
          memoryMb: result.memoryMb,
          timedOut: result.timedOut,
        },
      });
      logger.info("RESPONSE SENT");
    } catch (error) {
      next(error);
    }
  }

  /**
   * Direct evaluate endpoint (optional). Always loads official testcases from
   * ProblemService internal API — never trusts client-supplied hidden cases.
   */
  async evaluateSubmission(
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> {
    try {
      const validated = evaluateSubmissionSchema.parse(req.body);

      const problemRes = await axios.get(
        `${serverConfig.PROBLEM_SERVICE}/problems/internal/${validated.problemId}`,
        { timeout: 5000 }
      );
      const problem = problemRes.data?.data;
      const official = (problem?.testcases || []).map((tc: any) => ({
        input: tc.input,
        output: tc.output ?? tc.expectedOutput ?? "",
        expectedOutput: tc.expectedOutput ?? tc.output ?? "",
        isHidden: Boolean(tc.isHidden),
      }));

      if (!official.length) {
        sendResponse({
          res,
          statusCode: HTTP_STATUS.BAD_REQUEST,
          message: "Problem has no official test cases",
          data: null,
        });
        return;
      }

      const result = await evaluationService.evaluateSubmission({
        submissionId: validated.submissionId,
        problemId: validated.problemId,
        code: validated.code,
        language: validated.language,
        testcases: official,
        timeLimitMs: validated.timeLimitMs ?? problem?.timeLimitMs,
        memoryLimitMb: validated.memoryLimitMb ?? problem?.memoryLimitMb,
        mode: "submit",
      });

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
