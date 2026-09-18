import axios, { AxiosError, AxiosResponse } from "axios";
import { serverConfig } from "../config";
import {
  BadRequestError,
  InternalServerError,
  NotFoundError,
  ForbiddenError,
} from "../utils/errors/app.error";
import logger from "../config/logger.config";

export type Difficulty = "easy" | "medium" | "hard";

export interface ITestCase {
  input: string;
  expectedOutput: string;
  isHidden?: boolean;
}

export interface IProblemDetails {
  id: string;
  title: string;
  description: string;
  difficulty: Difficulty;

  category: string;
  editorial?: string;

  tags: string[];
  testcases: ITestCase[];

  functionName?: string;
  className?: string;
  returnType?: string;
  parameters?: Array<{ name: string; type: string }>;
  timeLimitMs?: number;
  memoryLimitMb?: number;

  createdAt: Date;
  updatedAt: Date;
}

export interface IProblemResponse {
  data: IProblemDetails;
  message: string;
}

export async function getProblemById(
  problemId: string,
): Promise<IProblemDetails | null> {
  try {
    const response: AxiosResponse<IProblemResponse> = await axios.get(
      `${serverConfig.PROBLEM_SERVICE}/problems/internal/${problemId}`,
      {
        timeout: 5000,
        headers: {
          "x-internal-secret": serverConfig.INTERNAL_SERVICE_SECRET,
        },
      },
    );


    if (!response.data?.data) {
      throw new InternalServerError("Invalid problem response");
    }

    return response.data.data;
  } catch (err) {
    const error = err as AxiosError;

    if (error.response) {
      const status = error.response.status;
      logger.error("Problem Service Error", {
        problemId,
        status,
        data: error.response.data,
      });
      if (status === 404) {
        throw new NotFoundError("Problem not found");
      }
      if (status === 400) {
        throw new BadRequestError("Invalid problem request");
      }
      if (status >= 500) {
        throw new InternalServerError("Problem service is down");
      }
    }
    if (error.request) {
      logger.error("No response from Problem Service", {
        problemId,
      });
      throw new InternalServerError("Problem service not reachable");
    }
    logger.error("Unexpected error", {
      problemId,
      error: error.message,
    });
    throw new InternalServerError("Unexpected error occurred");
  }
}

/** Throws BadRequestError/NotFoundError if contest is outside LIVE window. */
export async function assertContestAllowsSubmission(
  contestId: string,
  userId?: string
): Promise<void> {
  try {
    const qs = userId ? `?userId=${encodeURIComponent(userId)}` : "";
    await axios.get(
      `${serverConfig.PROBLEM_SERVICE}/contests/internal/${contestId}/allows-submission${qs}`,
      {
        timeout: 5000,
        headers: {
          "x-internal-secret": serverConfig.INTERNAL_SERVICE_SECRET,
        },
      }
    );
  } catch (err) {
    const error = err as AxiosError<any>;
    const status = error.response?.status;
    const message =
      error.response?.data?.message ||
      error.message ||
      "Contest submission check failed";
    if (status === 404) throw new NotFoundError(message);
    if (status === 403) throw new BadRequestError(message);
    if (status === 400) throw new BadRequestError(message);
    throw new BadRequestError(message);
  }
}

/** Throws if mock interview session is outside its server timer window. */
export async function assertMockInterviewAllowsSubmission(
  sessionId: string,
  userId?: string
): Promise<void> {
  try {
    const qs = userId ? `?userId=${encodeURIComponent(userId)}` : "";
    await axios.get(
      `${serverConfig.PROBLEM_SERVICE}/internal/interviews/${sessionId}/allows-submission${qs}`,
      {
        timeout: 5000,
        headers: {
          "x-internal-secret": serverConfig.INTERNAL_SERVICE_SECRET,
        },
      }
    );
  } catch (err) {
    const error = err as AxiosError<any>;
    const status = error.response?.status;
    const message =
      error.response?.data?.message ||
      error.message ||
      "Mock interview submission check failed";
    if (status === 404) throw new NotFoundError(message);
    if (status === 403) throw new BadRequestError(message);
    if (status === 400) throw new BadRequestError(message);
    throw new BadRequestError(message);
  }
}

/** Throws if virtual contest session is outside its server timer window. */
export async function assertVirtualContestAllowsSubmission(
  sessionId: string,
  userId?: string,
  problemId?: string
): Promise<void> {
  try {
    const params = new URLSearchParams();
    if (userId) params.set("userId", userId);
    if (problemId) params.set("problemId", problemId);
    const qs = params.toString() ? `?${params.toString()}` : "";
    await axios.get(
      `${serverConfig.PROBLEM_SERVICE}/internal/virtual-contests/${sessionId}/allows-submission${qs}`,
      {
        timeout: 5000,
        headers: {
          "x-internal-secret": serverConfig.INTERNAL_SERVICE_SECRET,
        },
      }
    );
  } catch (err) {
    const error = err as AxiosError<any>;
    const status = error.response?.status;
    const message =
      error.response?.data?.message ||
      error.message ||
      "Virtual contest submission check failed";
    if (status === 404) throw new NotFoundError(message);
    if (status === 403) throw new BadRequestError(message);
    if (status === 400) throw new BadRequestError(message);
    throw new BadRequestError(message);
  }
}

/** Throws ForbiddenError PREMIUM_REQUIRED when free user tries non-sheet problems. */
export async function assertProblemSolveAccess(
  problemId: string,
  authorization?: string | null
): Promise<void> {
  try {
    const headers: Record<string, string> = {
      "x-internal-secret": serverConfig.INTERNAL_SERVICE_SECRET,
    };
    if (typeof authorization === "string" && authorization.startsWith("Bearer ")) {
      headers.Authorization = authorization;
      headers["x-user-authorization"] = authorization;
    }
    await axios.get(
      `${serverConfig.PROBLEM_SERVICE}/problems/internal/${problemId}/solve-access`,
      {
        timeout: 5000,
        headers,
      }
    );
  } catch (err) {
    const error = err as AxiosError<any>;
    const status = error.response?.status;
    const message =
      error.response?.data?.message ||
      error.message ||
      "Problem solve access check failed";
    const details = error.response?.data?.details;
    if (status === 404) throw new NotFoundError(message);
    if (status === 403) {
      throw new ForbiddenError(
        message,
        details?.code
          ? details
          : { code: "PREMIUM_REQUIRED", feature: "premium.problems" }
      );
    }
    if (status === 400) throw new BadRequestError(message);
    throw new InternalServerError("Problem solve access check failed");
  }
}
