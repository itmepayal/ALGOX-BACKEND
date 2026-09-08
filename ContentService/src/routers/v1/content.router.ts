import { Router } from "express";
import { ContentController } from "../../controllers/content.controller";
import { ContentService } from "../../services/content.service";
import { ContentRepository } from "../../repositories/content.repository";

const contentRepository = new ContentRepository();
const contentService = new ContentService(contentRepository);
const contentController = new ContentController(contentService);

const contentRouter = Router();

contentRouter.post("/editorials", contentController.upsertEditorial.bind(contentController));
contentRouter.get("/editorials/problem/:problemId", contentController.getEditorialByProblemId.bind(contentController));

contentRouter.post("/study-plans", contentController.createStudyPlan.bind(contentController));
contentRouter.get("/study-plans", contentController.getStudyPlans.bind(contentController));
contentRouter.get("/study-plans/:slug", contentController.getStudyPlanBySlug.bind(contentController));
contentRouter.post("/study-plans/progress", contentController.updateStudyPlanProgress.bind(contentController));
contentRouter.get("/study-plans/progress/:userId/:slug", contentController.getUserStudyPlanProgress.bind(contentController));

contentRouter.post("/articles", contentController.createArticle.bind(contentController));
contentRouter.get("/articles", contentController.getArticles.bind(contentController));
contentRouter.get("/articles/:slug", contentController.getArticleBySlug.bind(contentController));

contentRouter.post("/notes", contentController.upsertProblemNote.bind(contentController));
contentRouter.get("/notes/:userId/:problemId", contentController.getProblemNote.bind(contentController));
contentRouter.get("/notes/user/:userId", contentController.getUserNotes.bind(contentController));

export default contentRouter;
