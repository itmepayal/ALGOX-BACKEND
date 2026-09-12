import axios from "axios";

const REALTIME_INGEST =
  process.env.REALTIME_INGEST_URL ||
  "http://localhost:3010/api/v1/realtime/ingest/events";
const SECRET = process.env.INTERNAL_REALTIME_SECRET || "";

/** Fire-and-forget submission lifecycle events to RealtimeService. */
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
        source: "SubmissionService",
        userId: input.userId,
        room: input.room,
        status: input.status,
        payload: input.payload,
      },
      {
        timeout: 2000,
        headers: SECRET ? { "x-realtime-secret": SECRET } : {},
      }
    )
    .catch(() => {
      // Non-blocking — gateway may be down
    });
}
