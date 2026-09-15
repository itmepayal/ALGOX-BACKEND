import express from "express";
import { sheetService } from "../../services/sheet.service";
import { sendResponse } from "../../utils/helpers/response.helper";
import { HTTP_STATUS } from "../../utils/constants";
import { optionalAuthenticateJwt } from "../../middlewares/auth.middleware";

const sheetPublicRouter = express.Router();

/** Published learning sheets (client catalog). */
sheetPublicRouter.get("/", async (_req, res, next) => {
  try {
    const data = await sheetService.listPublishedMetas();
    sendResponse({
      res,
      statusCode: HTTP_STATUS.OK,
      message: "Published sheets retrieved",
      data,
    });
  } catch (e) {
    next(e);
  }
});

sheetPublicRouter.get("/:sheetId/preview", optionalAuthenticateJwt, async (req, res, next) => {
  try {
    const data = await sheetService.getPreview(String(req.params.sheetId));
    // Only expose published sheets publicly
    if ((data as any)?.status && (data as any).status !== "PUBLISHED") {
      res.status(404).json({ success: false, message: "Sheet not found" });
      return;
    }
    sendResponse({
      res,
      statusCode: HTTP_STATUS.OK,
      message: "Sheet preview retrieved",
      data,
    });
  } catch (e) {
    next(e);
  }
});

export default sheetPublicRouter;
