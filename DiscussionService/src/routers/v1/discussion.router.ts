import { Router } from "express";
import { DiscussionController } from "../../controllers/discussion.controller";
import { DiscussionService } from "../../services/discussion.service";
import { DiscussionRepository } from "../../repositories/discussion.repository";

const discussionRepository = new DiscussionRepository();
const discussionService = new DiscussionService(discussionRepository);
const discussionController = new DiscussionController(discussionService);

const discussionRouter = Router();

discussionRouter.post("/posts", discussionController.createPost.bind(discussionController));
discussionRouter.get("/posts", discussionController.getPosts.bind(discussionController));
discussionRouter.get("/posts/:id", discussionController.getPostById.bind(discussionController));
discussionRouter.post("/posts/:id/vote", discussionController.votePost.bind(discussionController));
discussionRouter.post("/posts/:id/bookmark", discussionController.bookmarkPost.bind(discussionController));

discussionRouter.post("/comments", discussionController.addComment.bind(discussionController));
discussionRouter.get("/posts/:id/comments", discussionController.getComments.bind(discussionController));

export default discussionRouter;
