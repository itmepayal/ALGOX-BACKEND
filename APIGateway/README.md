# AlgoPath API Gateway

The gateway listens on port `3000` and routes requests by a fixed service prefix. It uses only Node.js built-in HTTP, HTTPS, crypto, and filesystem modules, so it adds no runtime dependencies.

## Start

From `server/APIGateway`, copy `.env.example` to `.env` and set deployment-specific service URLs, then run `npm start`. `server/start-all.js` starts the gateway and all nine existing services together.

## Public routes

Requests use `/api/<service>/<existing-service-path>`. For example, `/api/problems/api/v1/problems` is proxied to ProblemService at `/api/v1/problems`. Supported service prefixes are `/api/auth`, `/api/problems`, `/api/submissions`, `/api/leaderboard`, `/api/evaluation`, `/api/analytics`, `/api/discussion`, `/api/content`, and `/api/realtime`.

The gateway streams request and response bodies without parsing them, preserving multipart and raw webhook bodies. It forwards auth, cookies, content negotiation and request IDs; strips hop-by-hop and upstream CORS headers; applies bounded body and timeout settings; and never accepts a client-selected upstream URL.

RealtimeService supports polling and WebSocket upgrade traffic at `/api/realtime/socket.io`. `GET /health` reports gateway liveness. `GET /health/services` checks configured upstream health endpoints. API docs are served at `/api-docs` and `/openapi.json`.
