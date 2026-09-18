/**
 * In-memory sandbox checkout sessions for local/test verification.
 * Not used in production Stripe mode.
 */

export type SandboxCheckoutSession = {
  id: string;
  userId: string;
  email: string;
  customerId: string;
  subscriptionId: string;
  priceId: string;
  status: "open" | "complete" | "expired";
  createdAt: number;
};

const sessions = new Map<string, SandboxCheckoutSession>();

export const sandboxStore = {
  put(session: SandboxCheckoutSession) {
    sessions.set(session.id, session);
  },
  get(id: string) {
    return sessions.get(id) || null;
  },
  complete(id: string) {
    const s = sessions.get(id);
    if (s) s.status = "complete";
    return s || null;
  },
  clear() {
    sessions.clear();
  },
};
