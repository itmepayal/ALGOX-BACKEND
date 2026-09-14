import express from "express";
import {
  authenticateJwt,
  optionalAuthenticateJwt,
  requireInternalSecret,
} from "../../middlewares/auth.middleware";
import { requireFeatureFlag } from "../../middlewares/featureFlag.middleware";
import { contestController } from "../../controllers/contest.controller";

const contestRouter = express.Router();

contestRouter.get(
  "/internal/:contestId/allows-submission",
  requireInternalSecret,
  contestController.assertAllowsSubmission
);

contestRouter.get(
  "/:slug",
  optionalAuthenticateJwt,
  requireFeatureFlag("contests"),
  contestController.getBySlug
);
contestRouter.post(
  "/:slug/register",
  authenticateJwt,
  requireFeatureFlag("contests"),
  contestController.register
);

export default contestRouter;
