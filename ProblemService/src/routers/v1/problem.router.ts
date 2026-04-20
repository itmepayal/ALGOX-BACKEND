import express from "express";
import { validateRequestBody, validateRequestParams } from "../../validators";
import {
  createProblemSchema,
  difficultyParamsSchema,
  updateProblemSchema,
} from "../../validators/problem.validator";

import { ProblemController } from "../../controllers/problem.controller";
import { ProblemService } from "../../services/problem.service";
import { ProblemRepository } from "../../repositories/problem.repository";

const problemRouter = express.Router();

const problemRepository = new ProblemRepository();
const problemService = new ProblemService(problemRepository);
const problemController = new ProblemController(problemService);

problemRouter.post(
  "/",
  validateRequestBody(createProblemSchema),
  problemController.createProblem.bind(problemController),
);

problemRouter.get(
  "/",
  problemController.getAllProblems.bind(problemController),
);

problemRouter.get(
  "/search",
  problemController.searchProblems.bind(problemController),
);

problemRouter.get(
  "/:id",
  problemController.getProblemById.bind(problemController),
);

problemRouter.put(
  "/:id",
  validateRequestBody(updateProblemSchema),
  problemController.updateProblem.bind(problemController),
);

problemRouter.delete(
  "/:id",
  problemController.deleteProblem.bind(problemController),
);

problemRouter.get(
  "/difficulty/:difficulty",
  validateRequestParams(difficultyParamsSchema),
  problemController.findByDifficulty.bind(problemController),
);

export default problemRouter;
