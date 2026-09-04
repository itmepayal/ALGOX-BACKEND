import express from "express";
import leaderboardRouter from "./leaderboard.router";
import { sendResponse } from "../../utils/helpers/response.helper";
import { HTTP_STATUS, LEADERBOARD_MESSAGES } from "../../utils/constants";

const v1Router = express.Router();

v1Router.get("/health", (req, res) => {
  sendResponse({
    res,
    statusCode: HTTP_STATUS.OK,
    message: LEADERBOARD_MESSAGES.SERVICE_HEALTHY,
  });
});

v1Router.use("/leaderboard", leaderboardRouter);

export default v1Router;
