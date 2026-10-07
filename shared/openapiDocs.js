const fs = require("node:fs");
const path = require("node:path");

const allowedServices = new Set([
  "AuthService", "ProblemService", "SubmissionService", "LeaderboardService",
  "EvaluationService", "AnalyticsService", "DiscussionService", "ContentService",
  "RealtimeService",
]);

/** Register read-only OpenAPI JSON and Swagger UI without changing API middleware. */
function registerOpenApiDocs(app, service) {
  if (!allowedServices.has(service)) throw new Error(`Unknown OpenAPI service: ${service}`);
  const candidates = [
    path.resolve(__dirname, "../openapi", `${service}.json`),
    path.resolve(process.cwd(), "../openapi", `${service}.json`),
    path.resolve(process.cwd(), "server/openapi", `${service}.json`),
  ];
  const specPath = candidates.find((candidate) => fs.existsSync(candidate));
  if (!specPath) throw new Error(`OpenAPI document not found for ${service}`);
  app.get("/openapi.json", (_req, res) => {
    res.type("application/json").send(fs.readFileSync(specPath, "utf8"));
  });
  app.get("/api-docs", (_req, res) => {
    res.type("html").send(`<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>${service} API docs</title>
<link rel="stylesheet" href="https://unpkg.com/swagger-ui-dist@5.18.2/swagger-ui.css"></head>
<body><div id="swagger-ui"></div>
<script src="https://unpkg.com/swagger-ui-dist@5.18.2/swagger-ui-bundle.js"></script>
<script>window.ui = SwaggerUIBundle({url:"/openapi.json",dom_id:"#swagger-ui",deepLinking:true,persistAuthorization:false,displayRequestDuration:true,validatorUrl:null});</script>
</body></html>`);
  });
}

module.exports = { registerOpenApiDocs };
