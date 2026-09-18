import express from "express";
import {
  authenticateJwt,
  requireInternalSecret,
} from "../../middlewares/auth.middleware";
import { virtualContestController } from "../../controllers/virtualContest.controller";

const virtualContestRouter = express.Router();

virtualContestRouter.post(
  "/start",
  authenticateJwt,
  virtualContestController.start.bind(virtualContestController)
);
virtualContestRouter.get(
  "/active",
  authenticateJwt,
  virtualContestController.active.bind(virtualContestController)
);
virtualContestRouter.get(
  "/:sessionId",
  authenticateJwt,
  virtualContestController.getById.bind(virtualContestController)
);
virtualContestRouter.post(
  "/:sessionId/complete",
  authenticateJwt,
  virtualContestController.complete.bind(virtualContestController)
);
virtualContestRouter.post(
  "/:sessionId/abandon",
  authenticateJwt,
  virtualContestController.abandon.bind(virtualContestController)
);
virtualContestRouter.get(
  "/:sessionId/analytics",
  authenticateJwt,
  virtualContestController.analytics.bind(virtualContestController)
);

export default virtualContestRouter;

export function mountVirtualContestInternal(router: express.Router) {
  router.get(
    "/internal/virtual-contests/:sessionId/allows-submission",
    requireInternalSecret,
    virtualContestController.allowsSubmission.bind(virtualContestController)
  );
  router.post(
    "/internal/virtual-contests/:sessionId/record-submission",
    requireInternalSecret,
    virtualContestController.recordSubmission.bind(virtualContestController)
  );
}
