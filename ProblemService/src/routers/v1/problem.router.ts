import express from "express";
import { ProblemController } from "../../controllers/problem.controller";
import { ProblemService } from "../../services/problem.service";
import { ProblemRepository } from "../../repositories/problem.repository";
import { authenticateAdmin } from "../../middlewares/auth.middleware";

const problemRouter = express.Router();

const problemRepository = new ProblemRepository();
const problemService = new ProblemService(problemRepository);
const problemController = new ProblemController(problemService);

// Public User Endpoints
problemRouter.get("/", problemController.getProblems.bind(problemController));
problemRouter.get("/search", problemController.searchProblems.bind(problemController));
problemRouter.get("/difficulty/:difficulty", problemController.findByDifficulty.bind(problemController));
problemRouter.get("/slug/:slug", problemController.getProblemBySlug.bind(problemController));
problemRouter.get("/:id", problemController.getProblemById.bind(problemController));

// Internal / Admin Endpoints 
problemRouter.get("/internal/:id", problemController.getInternalProblemById.bind(problemController));
problemRouter.post("/", authenticateAdmin, problemController.createProblem.bind(problemController));
problemRouter.put("/:id", authenticateAdmin, problemController.updateProblem.bind(problemController));
problemRouter.delete("/:id", authenticateAdmin, problemController.deleteProblem.bind(problemController));

export default problemRouter;
