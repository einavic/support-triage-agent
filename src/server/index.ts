import "dotenv/config";
import express from "express";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { runAgentLoop } from "../agent/agentLoop.js";
import { createApp } from "./app.js";

// Starts the web API on http://localhost:PORT (default 3000) with the real agent.
// Listens on 127.0.0.1 only, so it's reachable from this computer but not from the rest of the network.
const port = Number(process.env.PORT) || 3000;
const app = createApp(runAgentLoop);

// If the React app has been built (npm run web:build), serve it from here too - one process,
// one address. During development the page is served by Vite instead (npm run web).
const webDist = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../web/dist");
if (existsSync(webDist)) {
  app.use(express.static(webDist));
  app.use((req, res, next) => {
    if (req.method === "GET" && !req.path.startsWith("/api")) res.sendFile(path.join(webDist, "index.html"));
    else next();
  });
}

app.listen(port, "127.0.0.1", () => {
  console.log(`Support agent API listening on http://localhost:${port}`);
  if (existsSync(webDist)) console.log(`Chat UI (built version) at http://localhost:${port}`);
});
