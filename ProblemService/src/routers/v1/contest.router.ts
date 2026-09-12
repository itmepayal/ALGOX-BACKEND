import express from "express";
import {
  authenticateJwt,
  optionalAuthenticateJwt,
} from "../../middlewares/auth.middleware";
import { contestController } from "../../controllers/contest.controller";

const contestRouter = express.Router();

contestRouter.get(
  "/internal/:contestId/allows-submission",
  contestController.assertAllowsSubmission
);

contestRouter.get(
  "/:slug",
  optionalAuthenticateJwt,
  contestController.getBySlug
);
contestRouter.post(
  "/:slug/register",
  authenticateJwt,
  contestController.register
);

export default contestRouter;
