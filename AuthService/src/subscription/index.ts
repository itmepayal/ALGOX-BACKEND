/**
 * Subscription / entitlement module — AuthService source of truth.
 */
export * from "./entitlement";
export * from "./features";
export * from "./engine";
export {
  requireEntitlement,
  PremiumRequiredError,
  UnknownFeatureError,
} from "./entitlement.middleware";
export { toPublicAuthUser } from "./publicAuthUser";
