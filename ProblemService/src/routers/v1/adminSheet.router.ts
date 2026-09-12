import express from "express";
import {
  authenticateJwt,
  requirePermission,
} from "../../middlewares/auth.middleware";
import { adminSheetController } from "../../controllers/adminSheet.controller";

const adminSheetRouter = express.Router();

adminSheetRouter.use(authenticateJwt);

// List / create / global sync
adminSheetRouter.get(
  "/",
  requirePermission("problems:view", "sheets:manage"),
  adminSheetController.list
);
adminSheetRouter.post(
  "/",
  requirePermission("sheets:create"),
  adminSheetController.create
);
adminSheetRouter.post(
  "/sync-from-catalog",
  requirePermission("sheets:manage"),
  adminSheetController.syncFromCatalog
);

// Nested resource routes BEFORE /:sheetId so "sections" / "topics" are not captured
adminSheetRouter.patch(
  "/sections/:sectionId",
  requirePermission("sheets:manage"),
  adminSheetController.updateSection
);
adminSheetRouter.delete(
  "/sections/:sectionId",
  requirePermission("sheets:manage"),
  adminSheetController.deleteSection
);
adminSheetRouter.post(
  "/sections/:sectionId/topics",
  requirePermission("sheets:manage"),
  adminSheetController.createTopic
);
adminSheetRouter.patch(
  "/sections/:sectionId/topics/reorder",
  requirePermission("sheets:manage"),
  adminSheetController.reorderTopics
);

adminSheetRouter.patch(
  "/topics/:topicId",
  requirePermission("sheets:manage"),
  adminSheetController.updateTopic
);
adminSheetRouter.delete(
  "/topics/:topicId",
  requirePermission("sheets:manage"),
  adminSheetController.deleteTopic
);
adminSheetRouter.post(
  "/topics/:topicId/problems",
  requirePermission("sheets:manage"),
  adminSheetController.attachProblem
);
adminSheetRouter.post(
  "/topics/:topicId/problems/bulk",
  requirePermission("sheets:manage"),
  adminSheetController.bulkAttach
);
adminSheetRouter.patch(
  "/topics/:topicId/problems/reorder",
  requirePermission("sheets:manage"),
  adminSheetController.reorderProblems
);
adminSheetRouter.delete(
  "/topics/:topicId/problems/:problemId",
  requirePermission("sheets:manage"),
  adminSheetController.removeProblem
);

// Sheet-level
adminSheetRouter.get(
  "/:sheetId",
  requirePermission("problems:view", "sheets:manage"),
  adminSheetController.get
);
adminSheetRouter.patch(
  "/:sheetId",
  requirePermission("sheets:manage"),
  adminSheetController.update
);
adminSheetRouter.delete(
  "/:sheetId",
  requirePermission("sheets:manage"),
  adminSheetController.remove
);
adminSheetRouter.post(
  "/:sheetId/publish",
  requirePermission("sheets:manage"),
  adminSheetController.publish
);
adminSheetRouter.post(
  "/:sheetId/archive",
  requirePermission("sheets:manage"),
  adminSheetController.archive
);
adminSheetRouter.get(
  "/:sheetId/preview",
  requirePermission("problems:view", "sheets:manage"),
  adminSheetController.preview
);
adminSheetRouter.post(
  "/:sheetId/sync-from-catalog",
  requirePermission("sheets:manage"),
  adminSheetController.syncFromCatalog
);
adminSheetRouter.post(
  "/:sheetId/sections",
  requirePermission("sheets:manage"),
  adminSheetController.createSection
);
adminSheetRouter.patch(
  "/:sheetId/sections/reorder",
  requirePermission("sheets:manage"),
  adminSheetController.reorderSections
);

export default adminSheetRouter;
