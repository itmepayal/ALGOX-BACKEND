/**
 * RESERVED — API v2 namespace (intentionally empty).
 *
 * Mounted at `/api/v2` for forward-compatible versioning.
 * Do not add ad-hoc v1 duplicates here. When a breaking API revision is
 * planned, register versioned routers under this mount and document the
 * migration. Clients and S2S callers currently use `/api/v1` only.
 */
import express from "express";

const v2Router = express.Router();

export default v2Router;
