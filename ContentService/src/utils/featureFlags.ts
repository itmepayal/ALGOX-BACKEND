/** Shared feature-flag client for microservices (Auth is source of truth). */
export type FeatureFlagKey =
  | "contests"
  | "discussions"
  | "submissions"
  | "registration"
  | "maintenance"
  | "newEditor"
  | "notifications";

export type FeatureFlags = Record<FeatureFlagKey, boolean>;

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

function normalize(data: any): FeatureFlags {
  const ff = data?.featureFlags || {};
  const flags: FeatureFlags = {
    contests: ff.contests ?? DEFAULTS.contests,
    discussions: ff.discussions ?? DEFAULTS.discussions,
    submissions: ff.submissions ?? DEFAULTS.submissions,
    registration: ff.registration ?? DEFAULTS.registration,
    maintenance: ff.maintenance ?? DEFAULTS.maintenance,
    newEditor: ff.newEditor ?? DEFAULTS.newEditor,
    notifications: ff.notifications ?? DEFAULTS.notifications,
  };
  if (typeof data?.discussionsEnabled === "boolean") {
    flags.discussions = data.discussionsEnabled;
  }
  if (typeof data?.registrationEnabled === "boolean") {
    flags.registration = data.registrationEnabled;
  }
  if (typeof data?.maintenanceMode === "boolean") {
    flags.maintenance = data.maintenanceMode;
  }
  return flags;
}

function authBase(authServiceUrl: string): string {
  return authServiceUrl.replace(/\/$/, "").replace(/\/api\/v1$/i, "");
}

export async function getRemoteFeatureFlags(authServiceUrl: string): Promise<{
  flags: FeatureFlags;
  allowAdminBypass: boolean;
}> {
  const now = Date.now();
  if (cache && now - cache.fetchedAt < TTL_MS) {
    return { flags: cache.flags, allowAdminBypass: cache.allowAdminBypass };
  }
  try {
    const url = `${authBase(authServiceUrl)}/api/v1/auth/public/settings`;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 4000);
    const res = await fetch(url, { signal: controller.signal });
    clearTimeout(timer);
    if (!res.ok) throw new Error(`settings ${res.status}`);
    const body = (await res.json()) as any;
    const data = body?.data ?? body;
    const flags = normalize(data);
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
