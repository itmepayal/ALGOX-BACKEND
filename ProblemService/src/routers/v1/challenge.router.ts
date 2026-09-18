import express from "express";
import {
  authenticateJwt,
  optionalAuthenticateJwt,
  requireInternalSecret,
  requirePermission,
} from "../../middlewares/auth.middleware";
import { challengeController } from "../../controllers/challenge.controller";

const challengeRouter = express.Router();

/** Public today + history (optional JWT for completion / premium unlock). */
challengeRouter.get(
  "/today",
  optionalAuthenticateJwt,
  challengeController.getToday.bind(challengeController)
);
challengeRouter.get(
  "/history",
  optionalAuthenticateJwt,
  challengeController.history.bind(challengeController)
);
challengeRouter.get(
  "/date/:dateKey",
  optionalAuthenticateJwt,
  challengeController.getByDate.bind(challengeController)
);

/** Authenticated progress surfaces */
challengeRouter.post(
  "/complete",
  authenticateJwt,
  challengeController.complete.bind(challengeController)
);
challengeRouter.get(
  "/streak",
  authenticateJwt,
  challengeController.streak.bind(challengeController)
);
challengeRouter.put(
  "/streak/timezone",
  authenticateJwt,
  challengeController.setTimezone.bind(challengeController)
);
challengeRouter.put(
  "/streak/goals",
  authenticateJwt,
  challengeController.setGoals.bind(challengeController)
);
challengeRouter.post(
  "/streak/freeze",
  authenticateJwt,
  challengeController.freeze.bind(challengeController)
);
challengeRouter.get(
  "/calendar",
  authenticateJwt,
  challengeController.calendar.bind(challengeController)
);
/**
 * Dedicated badges endpoint — also embedded in GET /challenges/streak.
 * Kept for clients that want badges without the full streak payload.
 */
challengeRouter.get(
  "/badges",
  authenticateJwt,
  challengeController.badges.bind(challengeController)
);

/**
 * Admin CMS — set / read canonical daily challenge by dateKey.
 * Consumed by Admin → Daily Challenges UI.
 */
challengeRouter.get(
  "/admin/:dateKey",
  authenticateJwt,
  requirePermission("problems:view", "problems:update", "problems:create"),
  challengeController.adminGetByDate.bind(challengeController)
);
challengeRouter.put(
  "/admin/:dateKey",
  authenticateJwt,
  requirePermission("problems:update", "problems:create"),
  challengeController.adminUpsert.bind(challengeController)
);

export default challengeRouter;

/** Internal S2S qualify after ACCEPTED evaluation — mounted separately. */
export function mountChallengeInternal(router: express.Router) {
  router.post(
    "/internal/challenges/qualify",
    requireInternalSecret,
    challengeController.internalQualify.bind(challengeController)
  );
}
