# RealtimeService (AlgoPath)

Production Socket.IO gateway for live presence, rooms, broadcasts, and admin ops.

## Stack

- Express 5 + Socket.IO 4 + TypeScript (`ts-node`)
- JWT auth (same `JWT_SECRET` as AuthService)
- Optional MongoDB for `BroadcastLog`
- Optional Redis (`REDIS_URL` + ioredis) for multi-instance Socket.IO adapter — degrades to in-memory if unset/unavailable

## Port

**3010** (see `src/config/index.ts` / `.env`)

## Quick start

```bash
cd server/RealtimeService
cp .env.example .env   # if needed
npm install
npm run dev            # nodemon
# or
npm start              # ts-node src/server.ts
```

Health: `GET http://localhost:3010/health`

## Client env

```env
VITE_REALTIME_URL=http://localhost:3010
```

Connect with Socket.IO client:

```ts
import { io } from "socket.io-client";

const socket = io(import.meta.env.VITE_REALTIME_URL, {
  auth: { token: accessToken }, // preferred
  // or Authorization: Bearer <token> header
});
```

Never send `userId` from the client for identity — the server verifies JWT and sets `socket.data.user`.

## Socket rooms

Join/leave via events `room.join` / `room.leave` with `{ room: "kind:id" }`:

| Kind | Example | Auth |
|------|---------|------|
| problem | `problem:abc123` | any authenticated user |
| contest | `contest:weekly-1` | any authenticated user |
| leaderboard | `leaderboard:global` | any authenticated user |
| discussion | `discussion:threadId` | any authenticated user |
| user | `user:<ownUserId>` | self or staff |
| admin | `admin:ops` | `realtime:view` / `admin:view` |
| system | `system:alerts` | `realtime:security` / debug / admin |

Users also auto-join `user:<userId>` and `role:<role>` on connect.

## Admin REST API

All under `/api/v1/admin/realtime` — require `Authorization: Bearer <JWT>` and a matching `realtime:*` permission.

| Method | Path | Permission |
|--------|------|------------|
| GET | `/overview` | `realtime:view` / analytics / health |
| GET | `/users` | `realtime:view` / connections |
| GET | `/connections` | `realtime:connections` |
| GET | `/rooms` | `realtime:rooms` |
| GET | `/events` | `realtime:events` |
| GET | `/analytics` | `realtime:analytics` |
| POST | `/broadcast` | `realtime:broadcast` |
| POST | `/connections/:id/disconnect` | `realtime:disconnect` |

### Broadcast body

```json
{
  "target": "everyone | online | users | roles | contest",
  "message": "Maintenance in 5 minutes",
  "title": "Notice",
  "event": "system.broadcast",
  "userIds": ["..."],
  "roles": ["admin"],
  "contestId": "...",
  "payload": {}
}
```

Tracks `sent` / `delivered` / `failed` in Mongo `BroadcastLog` when available, else in-memory.

### Metrics policy

Only real counters are returned (`activeConnections`, `peakConnections`, `eventsPerSecond`, reconnect/disconnect totals). Latency percentiles and worker CPU are always `null` so the UI can show **Metric unavailable** — values are never invented.

### Force disconnect

Requires `realtime:disconnect`. Emits `system.force_disconnect`, disconnects the socket, and attempts an audit write via Auth:

`POST {AUTH_SERVICE_URL}/auth/admin/audit` (forwarded bearer token).

## Event registry

See `src/socket/events.ts` for `user.*`, `submission.*`, `execution.*`, `worker.*`, `leaderboard.updated`, `notification.created`, `announcement.published`, `system.*`, `security.*`.
