# §15 Complete API Coverage Audit

Generated: 2026-10-07T15:24:51.834Z

## Counts

| Metric | Count |
|---|---:|
| backendRoutes | 446 |
| uniqueServiceOperations | 446 |
| clientAsyncMethods | 364 |
| clientUsed | 343 |
| clientLegitimatelyUnused | 18 |
| clientBroken | 3 |
| backendUsed | 379 |
| backendLegitimatelyUnused | 49 |
| backendMissingConsumer | 18 |
| backendMissingConsumerAdmin | 2 |
| backendMissingConsumerUser | 16 |
| duplicateClientPaths | 1 |
| duplicateBackendPaths | 5 |
| obsolete | 0 |

### Client method categories

| Category | Count |
|---|---:|
| USED | 343 |
| LEGITIMATELY UNUSED | 18 |
| BROKEN | 3 |

### Backend route categories

| Category | Count |
|---|---:|
| LEGITIMATELY UNUSED | 49 |
| USED | 379 |
| MISSING CONSUMER | 18 |

## BROKEN client APIs (3)

- `client/src/api/battleApi.ts:244` **getMyBattles** — GET /api/v1/battles/my:param — No backend route for GET /api/v1/battles/my:param
- `client/src/api/battleApi.ts:283` **getRatingHistory** — GET /api/v1/battles/rating/history:param — No backend route for GET /api/v1/battles/rating/history:param
- `client/src/api/teamApi.ts:198` **finishBattle** — POST /api/v1/team-battles/:param/finish — No backend route for POST /api/v1/team-battles/:param/finish

## MISSING CONSUMER — Admin backend (2)

- `AuthService` `GET /api/v1/auth/admin/test-users` — server/AuthService/src/routers/v1/admin.router.ts:50
- `ContentService` `PATCH /api/v1/content/admin/companies/:id/questions/:questionId` — server/ContentService/src/routers/v1/content.router.ts:168

## MISSING CONSUMER — User/public backend (16)

- `AuthService` `GET /api/v1/auth/social/discover` — server/AuthService/src/routers/v1/auth.router.ts:59
- `AuthService` `POST /api/v1/auth/social/friend-requests` — server/AuthService/src/routers/v1/auth.router.ts:60
- `AuthService` `GET /api/v1/auth/social/friend-requests` — server/AuthService/src/routers/v1/auth.router.ts:61
- `AuthService` `POST /api/v1/auth/social/friend-requests/:requestId/accept` — server/AuthService/src/routers/v1/auth.router.ts:62
- `AuthService` `POST /api/v1/auth/social/friend-requests/:requestId/reject` — server/AuthService/src/routers/v1/auth.router.ts:63
- `AuthService` `POST /api/v1/auth/social/friend-requests/:requestId/cancel` — server/AuthService/src/routers/v1/auth.router.ts:64
- `AuthService` `GET /api/v1/auth/social/friends` — server/AuthService/src/routers/v1/auth.router.ts:65
- `AuthService` `DELETE /api/v1/auth/social/friends/:userId` — server/AuthService/src/routers/v1/auth.router.ts:66
- `AuthService` `POST /api/v1/auth/social/follow/:userId` — server/AuthService/src/routers/v1/auth.router.ts:67
- `AuthService` `DELETE /api/v1/auth/social/follow/:userId` — server/AuthService/src/routers/v1/auth.router.ts:68
- `AuthService` `GET /api/v1/auth/social/followers` — server/AuthService/src/routers/v1/auth.router.ts:69
- `AuthService` `GET /api/v1/auth/social/following` — server/AuthService/src/routers/v1/auth.router.ts:70
- `AuthService` `GET /api/v1/auth/social/activity` — server/AuthService/src/routers/v1/auth.router.ts:71
- `AuthService` `GET /api/v1/auth/subscription/history` — server/AuthService/src/routers/v1/auth.router.ts:104
- `ProblemService` `GET /api/v1/challenges/badges` — server/ProblemService/src/routers/v1/challenge.router.ts:64
- `ProblemService` `GET /api/v1/problems/recommendations` — server/ProblemService/src/routers/v1/problem.router.ts:102

## LEGITIMATELY UNUSED client wrappers (18)

_Backend exists (or helper); no UI/caller reference found. Not deleted._

- `client/src/api/adminSheetApi.ts:178` **updateSection** — PATCH /api/v1/admin/sheets/sections/:param
- `client/src/api/adminSheetApi.ts:196` **reorderSections** — PATCH /api/v1/admin/sheets/:param/sections/reorder
- `client/src/api/adminSheetApi.ts:218` **updateTopic** — PATCH /api/v1/admin/sheets/topics/:param
- `client/src/api/adminSheetApi.ts:236` **reorderTopics** — PATCH /api/v1/admin/sheets/sections/:param/topics/reorder
- `client/src/api/adminSheetApi.ts:258` **bulkAttachProblems** — POST /api/v1/admin/sheets/topics/:param/problems/bulk
- `client/src/api/adminSheetApi.ts:269` **reorderProblems** — PATCH /api/v1/admin/sheets/topics/:param/problems/reorder
- `client/src/api/battleApi.ts:197` **cancelChallenge** — POST /api/v1/battles/:param/cancel
- `client/src/api/battleApi.ts:264` **getRatingStats** — GET /api/v1/battles/rating/me
- `client/src/api/contentApi.ts:214` **listMyStudyPlanProgress** — GET /api/v1/content/study-plans/progress/me
- `client/src/api/engagementApi.ts:331` **addRevision** — POST /api/v1/problems/:param/revision
- `client/src/api/engagementApi.ts:338` **removeRevision** — DELETE /api/v1/problems/:param/revision
- `client/src/api/submissionApi.ts:106` **getByUserId** — GET /api/v1/submissions/user/:param
- `client/src/api/submissionApi.ts:126` **getByStatus** — GET /api/v1/submissions/status/:param
- `client/src/api/submissionApi.ts:131` **getByLanguage** — GET /api/v1/submissions/language/:param
- `client/src/api/teamApi.ts:99` **getTeamById** — GET /api/v1/teams/:param
- `client/src/api/teamApi.ts:155` **transferOwnership** — POST /api/v1/teams/:param/transfer-ownership
- `client/src/api/teamApi.ts:179` **selectParticipants** — POST /api/v1/team-battles/:param/participants
- `client/src/api/tournamentApi.ts:108` **getTournamentBySlug** — GET /api/v1/tournaments/:param

## Duplicate client paths (1)

- `DELETE /api/v1/submissions/:param` → client/src/api/adminSubmissionApi.ts::remove, client/src/api/submissionApi.ts::deleteSubmission

## Duplicate backend paths (5)

- `GET /api/v2/health` → AuthService:server/AuthService/src/routers/v1/index.router.ts:14 | ProblemService:server/ProblemService/src/routers/v1/index.router.ts:37 | SubmissionService:server/SubmissionService/src/routers/v1/index.router.ts:17 | EvaluationService:server/EvaluationService/src/routers/v1/index.router.ts:17
- `POST /api/v2/internal/feature-flags/invalidate` → ProblemService:server/ProblemService/src/routers/v1/index.router.ts:46 | SubmissionService:server/SubmissionService/src/routers/v1/index.router.ts:76 | EvaluationService:server/EvaluationService/src/routers/v1/index.router.ts:78
- `GET /api/v1/health` → LeaderboardService:server/LeaderboardService/src/routers/v1/index.router.ts:11 | AnalyticsService:server/AnalyticsService/src/server.ts:65 | DiscussionService:server/DiscussionService/src/server.ts:69 | ContentService:server/ContentService/src/server.ts:73 | RealtimeService:server/RealtimeService/src/server.ts:74
- `POST /api/v1/internal/feature-flags/invalidate` → LeaderboardService:server/LeaderboardService/src/routers/v1/index.router.ts:20 | AnalyticsService:server/AnalyticsService/src/server.ts:73 | DiscussionService:server/DiscussionService/src/server.ts:73 | ContentService:server/ContentService/src/server.ts:82 | RealtimeService:server/RealtimeService/src/server.ts:89
- `GET /health` → EvaluationService:server/EvaluationService/src/server.ts:72 | DiscussionService:server/DiscussionService/src/server.ts:65 | ContentService:server/ContentService/src/server.ts:65 | RealtimeService:server/RealtimeService/src/server.ts:49

## Notes

- Latency/metrics nulls and internal ingest routes are LEGITIMATELY UNUSED for browser clients.
- OBSOLETE: none auto-classified without proof (no deletes).
- Do not create UI solely to consume unused wrappers.
