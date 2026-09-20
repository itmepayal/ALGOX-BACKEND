import express from "express";
import { authenticateJwt } from "../../middlewares/auth.middleware";
import { requireInternalSecret } from "../../middlewares/auth.middleware";
import { requireFeature } from "../../middlewares/requireFeature.middleware";
import { learningController } from "../../controllers/learning.controller";

const learningRouter = express.Router();

learningRouter.use(authenticateJwt);

const requireDailyPlanner = requireFeature("premium.daily_planner");
const requireStudySessions = requireFeature("premium.study_sessions");

learningRouter.get(
  "/goals",
  requireDailyPlanner,
  learningController.getGoals.bind(learningController)
);
learningRouter.put(
  "/goals",
  requireDailyPlanner,
  learningController.putGoals.bind(learningController)
);

learningRouter.get(
  "/plans",
  requireDailyPlanner,
  learningController.listPlans.bind(learningController)
);
learningRouter.get(
  "/plans/:dateKey",
  requireDailyPlanner,
  learningController.getPlan.bind(learningController)
);
learningRouter.put(
  "/plans/:dateKey",
  requireDailyPlanner,
  learningController.putPlan.bind(learningController)
);

learningRouter.get(
  "/sessions",
  requireStudySessions,
  learningController.listSessions.bind(learningController)
);
learningRouter.get(
  "/sessions/active",
  requireStudySessions,
  learningController.getActive.bind(learningController)
);
learningRouter.post(
  "/sessions",
  requireStudySessions,
  learningController.startSession.bind(learningController)
);
learningRouter.post(
  "/sessions/active/pause",
  requireStudySessions,
  learningController.pauseSession.bind(learningController)
);
learningRouter.post(
  "/sessions/active/resume",
  requireStudySessions,
  learningController.resumeSession.bind(learningController)
);
learningRouter.post(
  "/sessions/active/end",
  requireStudySessions,
  learningController.endSession.bind(learningController)
);
learningRouter.patch(
  "/sessions/active/activity",
  requireStudySessions,
  learningController.recordActivity.bind(learningController)
);

export default learningRouter;

/** Mount before maintenance gate — Evaluation worker records session activity. */
export function mountLearningInternal(router: express.Router) {
  router.post(
    "/internal/learning/session-activity",
    requireInternalSecret,
    learningController.recordActivityInternal.bind(learningController)
  );
}
