import axios from "axios";

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

type Cached = {
  flags: FeatureFlags;
  allowAdminBypass: boolean;
  fetchedAt: number;
};

let cache: Cached | null = null;
const TTL_MS = 15_000;

function normalizeFlags(raw: any): FeatureFlags {
  const ff = raw?.featureFlags || raw || {};
  return {
    contests: ff.contests ?? DEFAULTS.contests,
    discussions: ff.discussions ?? DEFAULTS.discussions,
    submissions: ff.submissions ?? DEFAULTS.submissions,
    registration: ff.registration ?? DEFAULTS.registration,
    maintenance: ff.maintenance ?? DEFAULTS.maintenance,
    newEditor: ff.newEditor ?? DEFAULTS.newEditor,
    notifications: ff.notifications ?? DEFAULTS.notifications,
  };
}

/**
 * Fetch public platform feature flags from AuthService (short TTL cache).
 * Fail-open to defaults in non-production so a down Auth doesn't brick the platform;
 * fail-closed for maintenance/registration when Auth responds.
 */
export async function fetchFeatureFlags(
  authBaseUrl: string
): Promise<{ flags: FeatureFlags; allowAdminBypass: boolean }> {
  const now = Date.now();
  if (cache && now - cache.fetchedAt < TTL_MS) {
    return { flags: cache.flags, allowAdminBypass: cache.allowAdminBypass };
  }
  try {
    const base = authBaseUrl.replace(/\/$/, "");
    const url = base.includes("/api/")
      ? `${base}/auth/public/settings`
      : `${base}/api/v1/auth/public/settings`;
    const res = await axios.get(url, { timeout: 4000 });
    const data = res.data?.data ?? res.data;
    const flags = normalizeFlags(data);
    // Sync legacy booleans when present
    if (typeof data?.discussionsEnabled === "boolean") {
      flags.discussions = data.discussionsEnabled;
    }
    if (typeof data?.registrationEnabled === "boolean") {
      flags.registration = data.registrationEnabled;
    }
    if (typeof data?.maintenanceMode === "boolean") {
      flags.maintenance = data.maintenanceMode;
    }
    const allowAdminBypass = Boolean(data?.allowAdminBypass);
    cache = { flags, allowAdminBypass, fetchedAt: now };
    return { flags, allowAdminBypass };
  } catch {
    if (cache) return { flags: cache.flags, allowAdminBypass: cache.allowAdminBypass };
    return { flags: { ...DEFAULTS }, allowAdminBypass: true };
  }
}

export function isFeatureEnabled(
  flags: FeatureFlags,
  key: FeatureFlagKey
): boolean {
  if (key === "maintenance") return Boolean(flags.maintenance);
  return flags[key] !== false;
}
