import logger from "../config/logger.config";
import { contestService } from "../services/contest.service";

/**
 * Periodic contest lifecycle tick (AuthService campaign processor pattern).
 * Transitions SCHEDULED→LIVE and LIVE→ENDED from configured timestamps.
 * In-process mutex prevents overlapping ticks; Mongo atomic updates prevent
 * duplicate transitions across processes.
 */
const TICK_MS = Number(process.env.CONTEST_LIFECYCLE_TICK_MS) || 15_000;

let timer: ReturnType<typeof setInterval> | null = null;
let tickRunning = false;

async function runTick(): Promise<void> {
  if (tickRunning) return;
  tickRunning = true;
  try {
    const result = await contestService.processDueLifecycleTransitions();
    if (result.started || result.ended || result.expiredScheduled) {
      logger.info("Contest lifecycle tick", result);
    }
  } catch (err) {
    logger.error("Contest lifecycle tick failed", err);
  } finally {
    tickRunning = false;
  }
}

export function startContestLifecycleJob(): void {
  if (timer) return;
  void runTick();
  timer = setInterval(() => {
    void runTick();
  }, TICK_MS);
  logger.info(`Contest lifecycle job started (every ${TICK_MS}ms)`);
}

export function stopContestLifecycleJob(): void {
  if (timer) {
    clearInterval(timer);
    timer = null;
  }
}
