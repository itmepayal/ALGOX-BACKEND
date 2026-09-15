/** Minimal Auth feature-flag client for LeaderboardService (no axios dep). */
export type FeatureFlags = {
  contests: boolean;
  discussions: boolean;
  submissions: boolean;
  registration: boolean;
  maintenance: boolean;
  newEditor: boolean;
  notifications: boolean;
};

const DEFAULTS: FeatureFlags = {
  contests: true,
  discussions: true,
  submissions: true,
  registration: true,
  maintenance: false,
  newEditor: true,
  notifications: true,
};

let cache: {
  flags: FeatureFlags;
  allowAdminBypass: boolean;
  fetchedAt: number;
} | null = null;

const TTL_MS = 15_000;

export async function getRemoteFeatureFlags(authServiceUrl: string): Promise<{
  flags: FeatureFlags;
  allowAdminBypass: boolean;
}> {
  const now = Date.now();
  if (cache && now - cache.fetchedAt < TTL_MS) {
    return { flags: cache.flags, allowAdminBypass: cache.allowAdminBypass };
  }
  try {
    const base = authServiceUrl.replace(/\/$/, "");
    const url = `${base}/api/v1/auth/public/settings`;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 4000);
    const res = await fetch(url, { signal: controller.signal });
    clearTimeout(timer);
    if (!res.ok) throw new Error(`settings ${res.status}`);
    const body = (await res.json()) as any;
    const data = body?.data ?? body;
    const ff = data?.featureFlags || {};
    const flags: FeatureFlags = {
      contests: ff.contests ?? DEFAULTS.contests,
      discussions:
        ff.discussions ?? data?.discussionsEnabled ?? DEFAULTS.discussions,
      submissions: ff.submissions ?? DEFAULTS.submissions,
      registration:
        ff.registration ?? data?.registrationEnabled ?? DEFAULTS.registration,
      maintenance:
        Boolean(ff.maintenance) || Boolean(data?.maintenanceMode) || false,
      newEditor: ff.newEditor ?? DEFAULTS.newEditor,
      notifications: ff.notifications ?? DEFAULTS.notifications,
    };
    const allowAdminBypass = Boolean(data?.allowAdminBypass);
    cache = { flags, allowAdminBypass, fetchedAt: now };
    return { flags, allowAdminBypass };
  } catch {
    if (cache) {
      return { flags: cache.flags, allowAdminBypass: cache.allowAdminBypass };
    }
    return { flags: { ...DEFAULTS }, allowAdminBypass: true };
  }
}
