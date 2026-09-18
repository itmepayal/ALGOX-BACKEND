# §15 Complete API Coverage Audit

Generated: 2026-09-18T16:09:02.442Z

## Counts

| Metric | Count |
|---|---:|
| backendRoutes | 354 |
| clientAsyncMethods | 297 |
| clientUsed | 284 |
| clientLegitimatelyUnused | 13 |
| clientBroken | 0 |
| backendUsed | 307 |
| backendLegitimatelyUnused | 44 |
| backendMissingConsumer | 3 |
| backendMissingConsumerAdmin | 1 |
| backendMissingConsumerUser | 2 |
| duplicateClientPaths | 2 |
| duplicateBackendPaths | 5 |
| obsolete | 0 |

### Client method categories

| Category | Count |
|---|---:|
| USED | 284 |
| LEGITIMATELY UNUSED | 13 |

### Backend route categories

| Category | Count |
|---|---:|
| LEGITIMATELY UNUSED | 44 |
| USED | 307 |
| MISSING CONSUMER | 3 |

## BROKEN client APIs (0)


## MISSING CONSUMER — Admin backend (1)

- `ContentService` `PATCH /api/v1/content/admin/companies/:id/questions/:questionId` — server/ContentService/src/routers/v1/content.router.ts:167

## MISSING CONSUMER — User/public backend (2)

- `AuthService` `GET /api/v1/auth/subscription/history` — server/AuthService/src/routers/v1/auth.router.ts:86
- `ProblemService` `GET /api/v1/challenges/badges` — server/ProblemService/src/routers/v1/challenge.router.ts:64

## LEGITIMATELY UNUSED client wrappers (13)

_Backend exists (or helper); no UI/caller reference found. Not deleted._

- `client/src/api/adminSheetApi.ts:178` **updateSection** — PATCH /api/v1/admin/sheets/sections/:param
- `client/src/api/adminSheetApi.ts:196` **reorderSections** — PATCH /api/v1/admin/sheets/:param/sections/reorder
- `client/src/api/adminSheetApi.ts:218` **updateTopic** — PATCH /api/v1/admin/sheets/topics/:param
- `client/src/api/adminSheetApi.ts:236` **reorderTopics** — PATCH /api/v1/admin/sheets/sections/:param/topics/reorder
- `client/src/api/adminSheetApi.ts:258` **bulkAttachProblems** — POST /api/v1/admin/sheets/topics/:param/problems/bulk
- `client/src/api/adminSheetApi.ts:269` **reorderProblems** — PATCH /api/v1/admin/sheets/topics/:param/problems/reorder
- `client/src/api/contentApi.ts:209` **listMyStudyPlanProgress** — GET /api/v1/content/study-plans/progress/me
- `client/src/api/engagementApi.ts:197` **toggleFavorite** — POST /api/v1/problems/:param/favourite/toggle
- `client/src/api/engagementApi.ts:287` **addRevision** — POST /api/v1/problems/:param/revision
- `client/src/api/engagementApi.ts:294` **removeRevision** — DELETE /api/v1/problems/:param/revision
- `client/src/api/submissionApi.ts:105` **getByUserId** — GET /api/v1/submissions/user/:param
- `client/src/api/submissionApi.ts:125` **getByStatus** — GET /api/v1/submissions/status/:param
- `client/src/api/submissionApi.ts:130` **getByLanguage** — GET /api/v1/submissions/language/:param

## Duplicate client paths (2)

- `GET /api/v1/challenges/date/:param` → client/src/api/adminChallengeApi.ts::getByDate, client/src/api/challengeApi.ts::getByDate
- `DELETE /api/v1/submissions/:param` → client/src/api/adminSubmissionApi.ts::remove, client/src/api/submissionApi.ts::deleteSubmission

## Duplicate backend paths (5)

- `GET /api/v2/health` → AuthService:server/AuthService/src/routers/v1/index.router.ts:13 | ProblemService:server/ProblemService/src/routers/v1/index.router.ts:28 | SubmissionService:server/SubmissionService/src/routers/v1/index.router.ts:17 | EvaluationService:server/EvaluationService/src/routers/v1/index.router.ts:17
- `POST /api/v2/internal/feature-flags/invalidate` → ProblemService:server/ProblemService/src/routers/v1/index.router.ts:37 | SubmissionService:server/SubmissionService/src/routers/v1/index.router.ts:76 | EvaluationService:server/EvaluationService/src/routers/v1/index.router.ts:78
- `GET /api/v1/health` → LeaderboardService:server/LeaderboardService/src/routers/v1/index.router.ts:11 | AnalyticsService:server/AnalyticsService/src/server.ts:65 | DiscussionService:server/DiscussionService/src/server.ts:69 | ContentService:server/ContentService/src/server.ts:73 | RealtimeService:server/RealtimeService/src/server.ts:74
- `POST /api/v1/internal/feature-flags/invalidate` → LeaderboardService:server/LeaderboardService/src/routers/v1/index.router.ts:20 | AnalyticsService:server/AnalyticsService/src/server.ts:73 | DiscussionService:server/DiscussionService/src/server.ts:73 | ContentService:server/ContentService/src/server.ts:82 | RealtimeService:server/RealtimeService/src/server.ts:89
- `GET /health` → EvaluationService:server/EvaluationService/src/server.ts:72 | DiscussionService:server/DiscussionService/src/server.ts:65 | ContentService:server/ContentService/src/server.ts:65 | RealtimeService:server/RealtimeService/src/server.ts:49

## Notes

- Latency/metrics nulls and internal ingest routes are LEGITIMATELY UNUSED for browser clients.
- OBSOLETE: none auto-classified without proof (no deletes).
- Do not create UI solely to consume unused wrappers.
