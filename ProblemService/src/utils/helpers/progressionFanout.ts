import axios from "axios";
import { serverConfig } from "../../config";
import logger from "../../config/logger.config";

type ProgressionEvent = {
  eventKey: string;
  userId: string;
  eventType: "battle_won" | "contest_participation" | "contest_top10" | "streak_milestone";
  sourceId: string;
};

/** Send only verified event metadata to AuthService; retries are safe via eventKey. */
export async function recordProgressionEvent(event: ProgressionEvent): Promise<void> {
  const url = `${serverConfig.AUTH_SERVICE_URL.replace(/\/$/, "")}/api/v1/auth/internal/progression/events`;
  for (let attempt = 1; attempt <= 2; attempt += 1) {
    try {
      await axios.post(url, event, {
        timeout: 5_000,
        headers: { "x-internal-secret": serverConfig.INTERNAL_SERVICE_SECRET },
      });
      return;
    } catch (error) {
      const status = axios.isAxiosError(error) ? error.response?.status : undefined;
      logger.warn("Progression event fan-out failed", {
        eventType: event.eventType,
        eventKey: event.eventKey,
        attempt,
        status,
        code: axios.isAxiosError(error) ? error.code : undefined,
      });
      if (attempt === 1 && (!status || status >= 500 || status === 429)) {
        await new Promise((resolve) => setTimeout(resolve, 250));
        continue;
      }
      return;
    }
  }
}
