import express from "express";
import {
  authenticateJwt,
  requireInternalSecret,
} from "../../middlewares/auth.middleware";
import { srsController } from "../../controllers/srs.controller";

const srsRouter = express.Router();

srsRouter.get(
  "/queue",
  authenticateJwt,
  srsController.queue.bind(srsController)
);
srsRouter.get(
  "/timezone",
  authenticateJwt,
  srsController.getTimezone.bind(srsController)
);
srsRouter.put(
  "/timezone",
  authenticateJwt,
  srsController.setTimezone.bind(srsController)
);
srsRouter.post(
  "/enroll/:problemId",
  authenticateJwt,
  srsController.enroll.bind(srsController)
);
srsRouter.post(
  "/sync-from-solved",
  authenticateJwt,
  srsController.syncFromSolved.bind(srsController)
);
srsRouter.get(
  "/import-candidates",
  authenticateJwt,
  srsController.importCandidates.bind(srsController)
);
srsRouter.post(
  "/:problemId/review",
  authenticateJwt,
  srsController.review.bind(srsController)
);
srsRouter.post(
  "/:problemId/reschedule",
  authenticateJwt,
  srsController.reschedule.bind(srsController)
);
srsRouter.post(
  "/:problemId/status",
  authenticateJwt,
  srsController.setStatus.bind(srsController)
);

export default srsRouter;

export function mountSrsInternal(router: express.Router) {
  router.post(
    "/internal/srs/seed-on-solve",
    requireInternalSecret,
    srsController.seedOnSolveInternal.bind(srsController)
  );
}
