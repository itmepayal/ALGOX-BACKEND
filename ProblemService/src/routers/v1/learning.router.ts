import express from "express";
import { authenticateJwt } from "../../middlewares/auth.middleware";
import { learningController } from "../../controllers/learning.controller";

const learningRouter = express.Router();

learningRouter.use(authenticateJwt);

learningRouter.get(
  "/goals",
  learningController.getGoals.bind(learningController)
);
learningRouter.put(
  "/goals",
  learningController.putGoals.bind(learningController)
);

learningRouter.get(
  "/plans",
  learningController.listPlans.bind(learningController)
);
learningRouter.get(
  "/plans/:dateKey",
  learningController.getPlan.bind(learningController)
);
learningRouter.put(
  "/plans/:dateKey",
  learningController.putPlan.bind(learningController)
);

learningRouter.get(
  "/sessions",
  learningController.listSessions.bind(learningController)
);
learningRouter.get(
  "/sessions/active",
  learningController.getActive.bind(learningController)
);
learningRouter.post(
  "/sessions",
  learningController.startSession.bind(learningController)
);
learningRouter.post(
  "/sessions/active/pause",
  learningController.pauseSession.bind(learningController)
);
learningRouter.post(
  "/sessions/active/resume",
  learningController.resumeSession.bind(learningController)
);
learningRouter.post(
  "/sessions/active/end",
  learningController.endSession.bind(learningController)
);
learningRouter.patch(
  "/sessions/active/activity",
  learningController.recordActivity.bind(learningController)
);

export default learningRouter;
