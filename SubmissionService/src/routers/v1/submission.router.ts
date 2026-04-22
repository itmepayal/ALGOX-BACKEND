import { Router } from "express";
import { SubmissionController } from "../../controllers/submission.controller";
import { SubmissionService } from "../../services/submission.service";
import { SubmissionRepository } from "../../repositories/submission.repository";

const submissionRepository = new SubmissionRepository();
const submissionService = new SubmissionService(submissionRepository);
const submissionController = new SubmissionController(submissionService);

export const submissionRouter = Router();

submissionRouter.post(
  "/",
  submissionController.createSubmission.bind(submissionController),
);
submissionRouter.get(
  "/",
  submissionController.getAllSubmissions.bind(submissionController),
);
submissionRouter.get(
  "/search",
  submissionController.searchSubmissions.bind(submissionController),
);
submissionRouter.get(
  "/problem/:problemId",
  submissionController.getByProblemId.bind(submissionController),
);
submissionRouter.get(
  "/status/:status",
  submissionController.getByStatus.bind(submissionController),
);
submissionRouter.get(
  "/language/:language",
  submissionController.getByLanguage.bind(submissionController),
);
submissionRouter.get(
  "/:id",
  submissionController.getSubmissionById.bind(submissionController),
);
submissionRouter.put(
  "/:id",
  submissionController.updateSubmission.bind(submissionController),
);
submissionRouter.delete(
  "/:id",
  submissionController.deleteSubmission.bind(submissionController),
);
