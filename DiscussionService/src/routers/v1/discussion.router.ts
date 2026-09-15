import { Router } from "express";
import { DiscussionController } from "../../controllers/discussion.controller";
import { DiscussionService } from "../../services/discussion.service";
import { DiscussionRepository } from "../../repositories/discussion.repository";
import { ReportController } from "../../controllers/report.controller";
import { ReportService } from "../../services/report.service";
import {
  authenticateJwt,
  optionalAuthenticateJwt,
  requirePermission,
} from "../../middlewares/auth.middleware";
import {
  blockWhenMaintenance,
  requireFeatureFlag,
} from "../../middlewares/featureFlag.middleware";

const discussionRepository = new DiscussionRepository();
const discussionService = new DiscussionService(discussionRepository);
const discussionController = new DiscussionController(discussionService);
const reportService = new ReportService();
const reportController = new ReportController(reportService);

const discussionRouter = Router();

discussionRouter.use(blockWhenMaintenance);

const discussionsOn = requireFeatureFlag("discussions");

// Public / user — JWT required for mutations; list/get allow optional auth for staff filters
discussionRouter.get(
  "/posts",
  optionalAuthenticateJwt,
  discussionsOn,
  discussionController.getPosts.bind(discussionController)
);
discussionRouter.get(
  "/posts/:id",
  optionalAuthenticateJwt,
  discussionsOn,
  discussionController.getPostById.bind(discussionController)
);
discussionRouter.get(
  "/posts/:id/comments",
  optionalAuthenticateJwt,
  discussionsOn,
  discussionController.getComments.bind(discussionController)
);

discussionRouter.post(
  "/posts",
  authenticateJwt,
  discussionsOn,
  discussionController.createPost.bind(discussionController)
);
discussionRouter.patch(
  "/posts/:id",
  authenticateJwt,
  discussionsOn,
  discussionController.updatePost.bind(discussionController)
);
discussionRouter.delete(
  "/posts/:id",
  authenticateJwt,
  discussionsOn,
  discussionController.deletePost.bind(discussionController)
);
discussionRouter.post(
  "/posts/:id/vote",
  authenticateJwt,
  discussionsOn,
  discussionController.votePost.bind(discussionController)
);
discussionRouter.post(
  "/posts/:id/bookmark",
  authenticateJwt,
  discussionsOn,
  discussionController.bookmarkPost.bind(discussionController)
);
discussionRouter.post(
  "/comments",
  authenticateJwt,
  discussionsOn,
  discussionController.addComment.bind(discussionController)
);
discussionRouter.patch(
  "/comments/:id",
  authenticateJwt,
  discussionsOn,
  discussionController.updateComment.bind(discussionController)
);
discussionRouter.delete(
  "/comments/:id",
  authenticateJwt,
  discussionsOn,
  discussionController.deleteComment.bind(discussionController)
);

discussionRouter.post(
  "/reports",
  authenticateJwt,
  discussionsOn,
  reportController.create.bind(reportController)
);

// Admin moderation
discussionRouter.get(
  "/admin/posts",
  authenticateJwt,
  requirePermission("discussions:view"),
  discussionController.getPosts.bind(discussionController)
);
discussionRouter.post(
  "/admin/posts/:id/moderate",
  authenticateJwt,
  requirePermission("discussions:moderate"),
  discussionController.moderate.bind(discussionController)
);

discussionRouter.get(
  "/admin/reports",
  authenticateJwt,
  requirePermission("reports:view"),
  reportController.list.bind(reportController)
);
discussionRouter.get(
  "/admin/reports/:id",
  authenticateJwt,
  requirePermission("reports:view"),
  reportController.getById.bind(reportController)
);
discussionRouter.post(
  "/admin/reports/:id/assign",
  authenticateJwt,
  requirePermission("reports:review"),
  reportController.assign.bind(reportController)
);
discussionRouter.post(
  "/admin/reports/:id/review",
  authenticateJwt,
  requirePermission("reports:review"),
  reportController.review.bind(reportController)
);
discussionRouter.post(
  "/admin/reports/:id/resolve",
  authenticateJwt,
  requirePermission("reports:resolve"),
  reportController.resolve.bind(reportController)
);
discussionRouter.post(
  "/admin/reports/:id/dismiss",
  authenticateJwt,
  requirePermission("reports:resolve"),
  reportController.dismiss.bind(reportController)
);
discussionRouter.post(
  "/admin/reports/:id/reopen",
  authenticateJwt,
  requirePermission("reports:review"),
  reportController.reopen.bind(reportController)
);

export default discussionRouter;
