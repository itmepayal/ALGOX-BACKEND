import express from "express";
import { serverConfig } from "./config";
import { connectDB } from "./config/db.config";
import contentRouter from "./routers/v1/content.router";

import cors from "cors";

const app = express();
app.use(cors({ origin: true, credentials: true }));
app.use(express.json());

app.use("/api/v1/content", contentRouter);

const startServer = async () => {
  try {
    await connectDB();
    app.listen(serverConfig.PORT, () => {
      console.log(`ContentService is running on http://localhost:${serverConfig.PORT}`);
    });
  } catch (error) {
    console.error("Failed to start ContentService server:", error);
    process.exit(1);
  }
};

startServer();
