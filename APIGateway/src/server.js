const http = require("node:http");
const https = require("node:https");
const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const { URL } = require("node:url");
const config = require("./config");

const gatewayRoot = path.resolve(__dirname, "..");
const specPath = path.join(gatewayRoot, "openapi.json");
const hopByHop = new Set([
  "connection",
  "keep-alive",
  "proxy-authenticate",
  "proxy-authorization",
  "te",
  "trailer",
  "transfer-encoding",
  "upgrade",
  "host",
]);
const corsAllowedHeaders = new Set([
  "authorization",
  "content-type",
  "accept",
  "x-request-id",
  "x-csrf-token",
  "x-requested-with",
]);
const requestIdPattern = /^[A-Za-z0-9._:-]{1,128}$/;
const sockets = new Set();

function requestId(req) {
  const candidate =
    req.headers["x-request-id"] || req.headers["x-correlation-id"];
  return typeof candidate === "string" && requestIdPattern.test(candidate)
    ? candidate
    : crypto.randomUUID();
}

function serviceFor(pathname) {
  return config.services.find(
    (service) =>
      pathname === service.prefix || pathname.startsWith(`${service.prefix}/`),
  );
}

function sendJson(res, status, body, id) {
  if (res.headersSent || res.destroyed) return;
  res.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store",
    "x-request-id": id,
    "x-correlation-id": id,
    ...(res.__corsHeaders || {}),
  });
  res.end(JSON.stringify({ success: false, message: body, requestId: id }));
}

function corsHeaders(origin) {
  return {
    "access-control-allow-origin": origin,
    "access-control-allow-credentials": "true",
    "access-control-expose-headers":
      "X-Request-ID, Retry-After, Content-Disposition",
    vary: "Origin",
  };
}

function handleCors(req, res, id) {
  const origin = req.headers.origin;
  if (!origin) return true;
  if (!config.allowedOrigins.includes(origin)) {
    sendJson(res, 403, "Origin is not allowed", id);
    return false;
  }
  res.__corsHeaders = corsHeaders(origin);
  if (req.method === "OPTIONS") {
    const requestedHeaders = String(
      req.headers["access-control-request-headers"] || "",
    )
      .split(",")
      .map((header) => header.trim().toLowerCase())
      .filter(Boolean);
    if (requestedHeaders.some((header) => !corsAllowedHeaders.has(header))) {
      sendJson(res, 403, "Requested header is not allowed", id);
      return false;
    }
    res.writeHead(204, {
      ...res.__corsHeaders,
      "access-control-allow-methods": "GET,HEAD,POST,PUT,PATCH,DELETE,OPTIONS",
      "access-control-allow-headers": requestedHeaders.join(", "),
      "access-control-max-age": "600",
      "x-request-id": id,
    });
    res.end();
    return false;
  }
  return true;
}

function buildUpstreamPath(service, requestUrl) {
  const parsed = new URL(requestUrl, "http://gateway.invalid");
  let suffix = parsed.pathname.slice(service.prefix.length);
  if (!suffix) suffix = "/";

  // Translate clean frontend public paths like /api/problems/v1/problems -> /api/v1/problems
  if (suffix.startsWith("/v1/")) {
    suffix = `/api${suffix}`;
  } else if (suffix.startsWith("/v2/")) {
    suffix = `/api${suffix}`;
  }

  return `${suffix}${parsed.search}`;
}

function filteredRequestHeaders(req, upstreamUrl, id) {
  const headers = {};
  const connectionTokens = String(req.headers.connection || "")
    .split(",")
    .map((v) => v.trim().toLowerCase());
  for (const [key, value] of Object.entries(req.headers)) {
    const lower = key.toLowerCase();
    if (
      hopByHop.has(lower) ||
      connectionTokens.includes(lower) ||
      lower === "x-request-id" ||
      lower === "x-correlation-id"
    )
      continue;
    if (value !== undefined) headers[lower] = value;
  }
  headers.host = upstreamUrl.host;
  headers["x-request-id"] = id;
  headers["x-correlation-id"] = id;
  headers["x-forwarded-host"] = req.headers.host || "";
  headers["x-forwarded-proto"] = req.socket.encrypted ? "https" : "http";
  headers["x-forwarded-for"] = req.socket.remoteAddress || "unknown";
  return headers;
}

function filteredResponseHeaders(headers, id, origin, service) {
  const result = {};
  const connectionTokens = String(headers.connection || "")
    .split(",")
    .map((v) => v.trim().toLowerCase());
  for (const [key, value] of Object.entries(headers)) {
    const lower = key.toLowerCase();
    if (
      hopByHop.has(lower) ||
      connectionTokens.includes(lower) ||
      lower.startsWith("access-control-") ||
      lower === "x-powered-by"
    )
      continue;
    if (value !== undefined) {
      if (lower === "location" && service) {
        const values = Array.isArray(value) ? value : [value];
        result[lower] = values.map((location) => {
          try {
            const target = new URL(location, service.url);
            if (target.origin === service.url.origin)
              return `${service.prefix}${target.pathname}${target.search}${target.hash}`;
          } catch {}
          return location;
        });
      } else result[lower] = value;
    }
  }
  result["x-request-id"] = id;
  result["x-correlation-id"] = id;
  if (origin) Object.assign(result, corsHeaders(origin));
  return result;
}

function timeoutFor(service) {
  if (service.name === "evaluation") return config.evaluationTimeoutMs;
  if (service.name === "submissions") return config.submissionTimeoutMs;
  return config.timeoutMs;
}

function logResult(req, service, id, status, startedAt, failure = "") {
  const pathOnly = new URL(req.url, "http://gateway.invalid").pathname;
  console.log(
    `[Gateway] ${req.method} ${pathOnly} → ${service} ← ${status} (${Date.now() - startedAt}ms) requestId=${id}${failure ? ` ${failure}` : ""}`,
  );
}

function proxyHttp(req, res, service, id, startedAt) {
  const upstreamUrl = new URL(service.url);
  const transport = upstreamUrl.protocol === "https:" ? https : http;
  const pathAndQuery = buildUpstreamPath(service, req.url);
  const options = {
    protocol: upstreamUrl.protocol,
    hostname: upstreamUrl.hostname,
    port: upstreamUrl.port || (upstreamUrl.protocol === "https:" ? 443 : 80),
    method: req.method,
    path: `${upstreamUrl.pathname.replace(/\/$/, "")}${pathAndQuery}`,
    headers: filteredRequestHeaders(req, upstreamUrl, id),
    agent: false,
  };
  const upstream = transport.request(options, (upstreamRes) => {
    const origin = req.headers.origin;
    res.writeHead(
      upstreamRes.statusCode || 502,
      filteredResponseHeaders(upstreamRes.headers, id, origin, service),
    );
    logResult(req, service.name, id, upstreamRes.statusCode || 502, startedAt);
    upstreamRes.pipe(res);
  });
  let timedOut = false;
  upstream.setTimeout(timeoutFor(service), () => {
    timedOut = true;
    upstream.destroy(new Error("upstream timeout"));
    sendJson(res, 504, "Upstream request timed out", id);
    logResult(req, service.name, id, 504, startedAt, "timeout");
  });
  upstream.on("error", (error) => {
    if (timedOut || res.destroyed || res.writableEnded) return;
    const status = error.code === "ECONNRESET" && req.aborted ? 499 : 503;
    sendJson(res, status, "Upstream service is unavailable", id);
    logResult(req, service.name, id, status, startedAt, "upstream unavailable");
  });

  const declaredLength = Number(req.headers["content-length"] || 0);
  if (declaredLength > config.maxBodyBytes) {
    upstream.destroy();
    sendJson(res, 413, "Request body exceeds the gateway limit", id);
    logResult(req, service.name, id, 413, startedAt, "body limit");
    return;
  }
  let received = 0;
  req.on("data", (chunk) => {
    received += chunk.length;
    if (received > config.maxBodyBytes && !res.writableEnded) {
      req.unpipe(upstream);
      upstream.destroy();
      sendJson(res, 413, "Request body exceeds the gateway limit", id);
      logResult(req, service.name, id, 413, startedAt, "body limit");
    }
  });
  req.pipe(upstream);
}

async function serviceHealth(service) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 5000);
  try {
    const url = new URL(service.healthPath, service.url);
    const response = await fetch(url, {
      signal: controller.signal,
      headers: { accept: "application/json" },
    });
    return {
      status: response.ok ? "healthy" : "unhealthy",
      httpStatus: response.status,
    };
  } catch {
    return { status: "unavailable" };
  } finally {
    clearTimeout(timeout);
  }
}

const server = http.createServer(async (req, res) => {
  const id = requestId(req);
  res.__corsHeaders = {};
  res.setHeader("x-request-id", id);
  res.setHeader("x-correlation-id", id);
  if (!handleCors(req, res, id)) return;
  const pathname = new URL(req.url, "http://gateway.invalid").pathname;
  if (req.method === "GET" && pathname === "/health") {
    res.writeHead(200, {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
      "x-request-id": id,
      ...res.__corsHeaders,
    });
    res.end(
      JSON.stringify({
        success: true,
        service: "APIGateway",
        status: "ok",
        requestId: id,
      }),
    );
    return;
  }
  if (req.method === "GET" && pathname === "/health/ready") {
    const services = Object.fromEntries(
      await Promise.all(
        config.services.map(async (service) => [
          service.name,
          await serviceHealth(service),
        ]),
      ),
    );
    const ready = Object.values(services).every(
      (result) => result.status === "healthy",
    );
    res.writeHead(ready ? 200 : 503, {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
      "x-request-id": id,
      ...res.__corsHeaders,
    });
    res.end(
      JSON.stringify({
        success: ready,
        service: "APIGateway",
        status: ready ? "ready" : "starting",
        services,
        requestId: id,
      }),
    );
    return;
  }
  if (req.method === "GET" && pathname === "/health/services") {
    const services = Object.fromEntries(
      await Promise.all(
        config.services.map(async (service) => [
          service.name,
          await serviceHealth(service),
        ]),
      ),
    );
    const healthy = Object.values(services).every(
      (result) => result.status === "healthy",
    );
    res.writeHead(healthy ? 200 : 503, {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
      "x-request-id": id,
      ...res.__corsHeaders,
    });
    res.end(
      JSON.stringify({
        success: healthy,
        service: "APIGateway",
        services,
        requestId: id,
      }),
    );
    return;
  }
  if (req.method === "GET" && pathname === "/openapi.json") {
    if (!fs.existsSync(specPath))
      return sendJson(res, 503, "Gateway OpenAPI document is unavailable", id);
    res.writeHead(200, {
      "content-type": "application/json; charset=utf-8",
      "x-request-id": id,
      ...res.__corsHeaders,
    });
    res.end(fs.readFileSync(specPath));
    return;
  }
  if (req.method === "GET" && (pathname === "/" || pathname === "/api-docs" || pathname === "/api-docs/")) {
    const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>AlgoPath API Documentation</title><link rel="stylesheet" href="https://unpkg.com/swagger-ui-dist@5.18.2/swagger-ui.css"></head><body><div id="swagger-ui"></div><script src="https://unpkg.com/swagger-ui-dist@5.18.2/swagger-ui-bundle.js"></script><script>SwaggerUIBundle({url:"/openapi.json",dom_id:"#swagger-ui",deepLinking:true,persistAuthorization:false,validatorUrl:null});</script></body></html>`;
    res.writeHead(200, {
      "content-type": "text/html; charset=utf-8",
      "x-request-id": id,
      ...res.__corsHeaders,
    });
    res.end(html);
    return;
  }
  if (req.method === "GET" && (pathname === "/internal-openapi.json")) {
    const internalPath = path.join(gatewayRoot, "internal-openapi.json");
    if (!fs.existsSync(internalPath))
      return sendJson(res, 503, "Gateway internal OpenAPI document is unavailable", id);
    res.writeHead(200, {
      "content-type": "application/json; charset=utf-8",
      "x-request-id": id,
      ...res.__corsHeaders,
    });
    res.end(fs.readFileSync(internalPath));
    return;
  }
  const service = serviceFor(pathname);
  if (!service) return sendJson(res, 404, "Route not found", id);
  proxyHttp(req, res, service, id, Date.now());
});

server.on("connection", (socket) => {
  sockets.add(socket);
  socket.once("close", () => sockets.delete(socket));
});

server.on("upgrade", (req, clientSocket, head) => {
  const id = requestId(req);
  const pathname = new URL(req.url, "http://gateway.invalid").pathname;
  const service = config.services.find(
    (candidate) =>
      candidate.name === "realtime" &&
      pathname.startsWith(`${candidate.prefix}/socket.io`),
  );
  if (
    !service ||
    (req.headers.origin && !config.allowedOrigins.includes(req.headers.origin))
  ) {
    clientSocket.end("HTTP/1.1 403 Forbidden\r\nConnection: close\r\n\r\n");
    return;
  }
  const upstreamUrl = new URL(service.url);
  const transport = upstreamUrl.protocol === "https:" ? https : http;
  const rewrittenPath = `${pathname.slice(service.prefix.length)}${new URL(req.url, "http://gateway.invalid").search}`;
  const upstreamReq = transport.request({
    protocol: upstreamUrl.protocol,
    hostname: upstreamUrl.hostname,
    port: upstreamUrl.port || (upstreamUrl.protocol === "https:" ? 443 : 80),
    method: req.method,
    path: `${upstreamUrl.pathname.replace(/\/$/, "")}${rewrittenPath}`,
    headers: {
      ...filteredRequestHeaders(req, upstreamUrl, id),
      upgrade: req.headers.upgrade,
      connection: "Upgrade",
    },
    agent: false,
  });
  upstreamReq.on("upgrade", (upstreamRes, upstreamSocket, upstreamHead) => {
    // The request timeout is only for the upgrade handshake, never for an idle live socket.
    upstreamReq.setTimeout(0);
    const headers = {
      ...filteredResponseHeaders(
        upstreamRes.headers,
        id,
        req.headers.origin,
        service,
      ),
      upgrade:
        upstreamRes.headers.upgrade || req.headers.upgrade || "websocket",
      connection: "Upgrade",
    };
    const lines = [
      `HTTP/1.1 ${upstreamRes.statusCode || 101} ${upstreamRes.statusMessage || "Switching Protocols"}`,
    ];
    for (const [key, value] of Object.entries(headers))
      for (const item of Array.isArray(value) ? value : [value])
        lines.push(`${key}: ${item}`);
    clientSocket.write(`${lines.join("\r\n")}\r\n\r\n`);
    if (upstreamHead.length) clientSocket.write(upstreamHead);
    if (head.length) upstreamSocket.write(head);
    clientSocket.pipe(upstreamSocket).pipe(clientSocket);
    const closeBoth = () => {
      clientSocket.destroy();
      upstreamSocket.destroy();
    };
    clientSocket.on("error", closeBoth);
    upstreamSocket.on("error", closeBoth);
    clientSocket.on("close", () => upstreamSocket.destroy());
    upstreamSocket.on("close", () => clientSocket.destroy());
  });
  upstreamReq.on("response", (response) => {
    clientSocket.end(
      `HTTP/1.1 ${response.statusCode} ${response.statusMessage}\r\nConnection: close\r\n\r\n`,
    );
  });
  upstreamReq.on("error", () =>
    clientSocket.end(
      "HTTP/1.1 503 Service Unavailable\r\nConnection: close\r\n\r\n",
    ),
  );
  upstreamReq.setTimeout(config.timeoutMs, () =>
    upstreamReq.destroy(new Error("upstream timeout")),
  );
  upstreamReq.end();
});

server.listen(config.port, () => {
  console.log(`[+] APIGateway listening on http://localhost:${config.port}`);
  console.log(`[+] Proxying ${config.services.length} fixed upstream services`);
});

let shuttingDown = false;
function shutdown(signal) {
  if (shuttingDown) return;
  shuttingDown = true;
  console.log(`[Gateway] ${signal} received; draining active connections`);
  const forceClose = setTimeout(() => {
    for (const socket of sockets) socket.destroy();
  }, config.shutdownGraceMs);
  forceClose.unref();
  server.close(() => {
    clearTimeout(forceClose);
    process.exit(0);
  });
  server.closeIdleConnections?.();
}
process.on("SIGINT", () => shutdown("SIGINT"));
process.on("SIGTERM", () => shutdown("SIGTERM"));

module.exports = { server, proxyHttp, serviceFor, buildUpstreamPath };
