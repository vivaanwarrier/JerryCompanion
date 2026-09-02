/*
 * dev-server.mjs - zero-dependency local dev server for Jerry.
 *
 *   node --env-file-if-exists=.env scripts/dev-server.mjs
 *   -> serves src/ at http://localhost:3000
 *   -> routes POST /api/agent to api/agent.js with a Vercel-like req/res shim
 *
 * This is a convenience for local work. Production uses Vercel, which serves
 * src/ and runs api/agent.js as a real serverless function (see vercel.json).
 */

import http from "node:http";
import { readFile } from "node:fs/promises";
import { extname, join, normalize } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const PUBLIC_DIR = join(ROOT, "src");
const PORT = Number(process.env.PORT) || 3000;

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".ico": "image/x-icon",
};

// Lazily import the handler so a syntax error there doesn't kill the server.
let agentHandler;
async function getAgentHandler() {
  if (!agentHandler) {
    ({ default: agentHandler } = await import("../api/agent.js"));
  }
  return agentHandler;
}

function shimResponse(res) {
  res.status = (code) => {
    res.statusCode = code;
    return res;
  };
  res.json = (obj) => {
    res.setHeader("content-type", "application/json; charset=utf-8");
    res.end(JSON.stringify(obj));
    return res;
  };
  res.send = (data) => {
    res.end(data);
    return res;
  };
  return res;
}

async function readBody(req) {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  return Buffer.concat(chunks).toString("utf8");
}

const server = http.createServer(async (req, res) => {
  shimResponse(res);
  const url = new URL(req.url, `http://${req.headers.host}`);

  if (url.pathname === "/api/agent") {
    try {
      const raw = await readBody(req);
      req.body = raw ? JSON.parse(raw) : {};
    } catch {
      req.body = {};
    }
    try {
      const handler = await getAgentHandler();
      await handler(req, res);
    } catch (err) {
      console.error(err);
      if (!res.writableEnded) res.status(500).json({ error: String(err?.message || err) });
    }
    return;
  }

  // Static files from src/
  let pathname = url.pathname === "/" ? "/index.html" : url.pathname;
  if (!extname(pathname)) pathname += ".html"; // cleanUrls parity
  const filePath = normalize(join(PUBLIC_DIR, pathname));
  if (!filePath.startsWith(PUBLIC_DIR)) {
    res.status(403).send("forbidden");
    return;
  }
  try {
    const data = await readFile(filePath);
    res.setHeader("content-type", MIME[extname(filePath)] || "application/octet-stream");
    res.status(200).send(data);
  } catch {
    res.status(404).send("not found");
  }
});

server.listen(PORT, () => {
  const key = process.env.ANTHROPIC_API_KEY;
  console.log(`Jerry dev server:  http://localhost:${PORT}`);
  console.log(`Mood agent:        ${key ? `live (${process.env.ANTHROPIC_MODEL || "claude-opus-5"})` : "rule-based fallback (no ANTHROPIC_API_KEY)"}`);
});
