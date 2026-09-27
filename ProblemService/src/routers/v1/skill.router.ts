import express from "express";
import { authenticateJwt } from "../../middlewares/auth.middleware";
import { skillController } from "../../controllers/skill.controller";

const skillRouter = express.Router();

skillRouter.get("/me", authenticateJwt, skillController.getMyProfile);
skillRouter.post("/me/recalculate", authenticateJwt, skillController.recalculateMyProfile);

export default skillRouter;
