import axios from "axios";
import { serverConfig } from "../../config";

const REALTIME_INGEST =
  process.env.REALTIME_INGEST_URL ||
  "http://localhost:3010/api/v1/realtime/ingest/events";

/** Fire-and-forget events to RealtimeService (non-blocking). */
export function emitRealtimeEvent(input: {
  event: string;
  userId?: string;
  room?: string;
  status?: string;
  payload?: Record<string, unknown>;
}): void {
  void axios
    .post(
      REALTIME_INGEST,
      {
        event: input.event,
        source: "ProblemService",
        userId: input.userId,
        room: input.room,
        status: input.status,
        payload: input.payload,
      },
      {
        timeout: 2000,
        headers: {
          "x-realtime-secret": serverConfig.INTERNAL_SERVICE_SECRET,
          "x-internal-secret": serverConfig.INTERNAL_SERVICE_SECRET,
        },
      }
    )
    .catch(() => {
      /* Realtime may be down */
    });
}
