/**
 * Measured realtime metrics only.
 * Unavailable signals (latency percentiles, worker CPU) stay null — never invent.
 */

const EVENT_WINDOW_MS = 1000;
const RATE_HISTORY_SECONDS = 60;

class RealtimeMetrics {
  private activeConnections = 0;
  private peakConnections = 0;
  private totalConnects = 0;
  private totalDisconnects = 0;
  private totalReconnects = 0;
  private startedAt = Date.now();

  /** Event timestamps in the current second + rolling history */
  private currentSecond = Math.floor(Date.now() / EVENT_WINDOW_MS);
  private currentSecondCount = 0;
  private eventsPerSecondHistory: number[] = [];

  onConnect(active: number): void {
    this.activeConnections = active;
    this.totalConnects += 1;
    if (active > this.peakConnections) this.peakConnections = active;
  }

  onDisconnect(active: number): void {
    this.activeConnections = active;
    this.totalDisconnects += 1;
  }

  onReconnect(): void {
    this.totalReconnects += 1;
  }

  recordEvent(): void {
    const sec = Math.floor(Date.now() / EVENT_WINDOW_MS);
    if (sec !== this.currentSecond) {
      this.eventsPerSecondHistory.push(this.currentSecondCount);
      if (this.eventsPerSecondHistory.length > RATE_HISTORY_SECONDS) {
        this.eventsPerSecondHistory.shift();
      }
      // Fill gaps with zeros for idle seconds (bounded)
      const gap = Math.min(sec - this.currentSecond - 1, RATE_HISTORY_SECONDS);
      for (let i = 0; i < gap; i++) {
        this.eventsPerSecondHistory.push(0);
        if (this.eventsPerSecondHistory.length > RATE_HISTORY_SECONDS) {
          this.eventsPerSecondHistory.shift();
        }
      }
      this.currentSecond = sec;
      this.currentSecondCount = 0;
    }
    this.currentSecondCount += 1;
  }

  getEventsPerSecond(): number {
    // Flush boundary without mutating mid-read too aggressively
    const sec = Math.floor(Date.now() / EVENT_WINDOW_MS);
    if (sec === this.currentSecond) return this.currentSecondCount;
    return 0;
  }

  snapshot() {
    const epsHistory = [...this.eventsPerSecondHistory];
    if (epsHistory.length === 0) {
      // Only include current second if we have samples
    } else {
      // include live second for display
    }

    const avgEps =
      epsHistory.length > 0
        ? epsHistory.reduce((a, b) => a + b, 0) / epsHistory.length
        : this.getEventsPerSecond();

    return {
      activeConnections: this.activeConnections,
      peakConnections: this.peakConnections,
      totalConnects: this.totalConnects,
      totalDisconnects: this.totalDisconnects,
      totalReconnects: this.totalReconnects,
      eventsPerSecond: this.getEventsPerSecond(),
      avgEventsPerSecond:
        epsHistory.length > 0 ? Math.round(avgEps * 100) / 100 : this.getEventsPerSecond(),
      eventsPerSecondHistory: epsHistory.slice(-RATE_HISTORY_SECONDS),
      uptimeMs: Date.now() - this.startedAt,
      /** Not measured in this process — UI shows "Metric unavailable" */
      latencyP50Ms: null as null,
      latencyP95Ms: null as null,
      latencyP99Ms: null as null,
      workerCpuPercent: null as null,
    };
  }
}

export const metrics = new RealtimeMetrics();
