import express from "express";
import { serverConfig } from "./config";
import { connectDB } from "./config/db.config";
import discussionRouter from "./routers/v1/discussion.router";

import cors from "cors";

const app = express();
app.use(cors({ origin: true, credentials: true }));
app.use(express.json());

app.use("/api/v1/discussions", discussionRouter);

const startServer = async () => {
  try {
    await connectDB();
    app.listen(serverConfig.PORT, () => {
      console.log(`DiscussionService is running on http://localhost:${serverConfig.PORT}`);
    });
  } catch (error) {
    console.error("Failed to start DiscussionService server:", error);
    process.exit(1);
  }
};

startServer();
