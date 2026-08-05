import http from "node:http";
import type { IncomingMessage, ServerResponse } from "node:http";
import { readFileSync } from "node:fs";

import { handleOAuthCallback, handleOAuthConfirm, handleOAuthCancel } from "../verification/webCallback.js";
import { handleAdminPanel } from "../admin/panel.js";

const TERMS_HTML = readFileSync(new URL("./pages/terms.html", import.meta.url), "utf-8");
const PRIVACY_HTML = readFileSync(new URL("./pages/privacy.html", import.meta.url), "utf-8");

const KEEP_ALIVE_INTERVAL_MS = 30_000;
const API_SERVER_PORT = 8081;

// Headers that must not be forwarded in a proxy (RFC 7230 §6.1 hop-by-hop).
const HOP_BY_HOP = new Set([
  "connection",
  "keep-alive",
  "proxy-authenticate",
  "proxy-authorization",
  "te",
  "trailers",
  "transfer-encoding",
  "upgrade",
]);

// Proxy a request to the internal api-server (Control Center backend).
function proxyToApiServer(req: IncomingMessage, res: ServerResponse): void {
  // Build a safe header set — strip hop-by-hop headers, then add forwarding headers.
  const safeHeaders: http.OutgoingHttpHeaders = {};
  for (const [key, value] of Object.entries(req.headers)) {
    if (!HOP_BY_HOP.has(key.toLowerCase())) {
      safeHeaders[key] = value;
    }
  }
  safeHeaders["x-forwarded-host"] = req.headers.host ?? "";
  safeHeaders["x-forwarded-proto"] = "https";

  const options: http.RequestOptions = {
    hostname: "localhost",
    port: API_SERVER_PORT,
    path: req.url ?? "/",
    method: req.method,
    headers: safeHeaders,
  };

  const proxyReq = http.request(options, (proxyRes) => {
    res.writeHead(proxyRes.statusCode ?? 502, proxyRes.headers);
    proxyRes.pipe(res, { end: true });
  });

  proxyReq.on("error", (err) => {
    console.error("[PROXY] Control Center request failed:", err.message);
    res.writeHead(502);
    res.end("Control Center unavailable");
  });

  req.pipe(proxyReq, { end: true });
}

export function startHttpServer(port: number): void {
  const server = http.createServer((req, res) => {
    // Kill connections that never finish sending/receiving within 30 s.
    req.socket.setTimeout(30_000);
    const path = req.url?.split("?")[0];

    if (path === "/api/oauth/callback") {
      handleOAuthCallback(req, res).catch((err) => {
        console.error("[OAUTH] Unhandled error in callback:", err);
        res.writeHead(500);
        res.end("Internal Server Error");
      });
      return;
    }

    if (path === "/api/oauth/confirm" && req.method === "POST") {
      handleOAuthConfirm(req, res).catch((err) => {
        console.error("[OAUTH] Unhandled error in confirm:", err);
        res.writeHead(500);
        res.end("Internal Server Error");
      });
      return;
    }

    if (path === "/api/oauth/cancel") {
      handleOAuthCancel(req, res);
      return;
    }

    if (path === "/admin/panel") {
      handleAdminPanel(req, res).catch((err) => {
        console.error("[ADMIN] Panel error:", err);
        res.writeHead(500);
        res.end("Internal Server Error");
      });
      return;
    }

    // Railway / uptime healthcheck — must respond before the Discord gateway connects.
    if (path === "/api/healthz") {
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ status: "ok" }));
      return;
    }

    // Proxy the Control Center dashboard and its API routes to the internal api-server.
    if (path?.startsWith("/dashboard") || path?.startsWith("/api/dashboard")) {
      proxyToApiServer(req, res);
      return;
    }

    if (path === "/terms") {
      res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
      res.end(TERMS_HTML);
      return;
    }

    if (path === "/privacy") {
      res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
      res.end(PRIVACY_HTML);
      return;
    }

    res.writeHead(404);
    res.end("Not Found");
  });

  server.listen(port, () => {
    console.log(`[KEEP-ALIVE] HTTP server running on port ${port}`);
  });

  setInterval(() => {
    http
      .get(`http://localhost:${port}/`, (res) => {
        res.resume();
      })
      .on("error", (err) => {
        console.warn("[KEEP-ALIVE] Self-ping failed:", err.message);
      });
  }, KEEP_ALIVE_INTERVAL_MS);
}
