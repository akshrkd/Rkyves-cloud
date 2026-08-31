import { serve } from "@hono/node-server";
import { Hono } from "hono";
import { cors } from "hono/cors";
import { logger } from "hono/logger";
import { config } from "./lib/config.js";
import { authRoutes } from "./routes/auth.js";
import { orgRoutes } from "./routes/orgs.js";
import { projectRoutes } from "./routes/projects.js";
import { serviceRoutes } from "./routes/services.js";
import { agentRoutes } from "./routes/agent.js";
import { cronRoutes } from "./routes/cron.js";
import { webhookRoutes } from "./routes/webhooks.js";
import { workerRoutes } from "./routes/workers.js";
import { startCronDispatcher, scheduleDailyBackups } from "./services/cron-dispatcher.js";

const app = new Hono();

app.use("*", logger());
app.use(
  "*",
  cors({
    origin: config.corsOrigin,
    allowHeaders: ["Content-Type", "Authorization"],
    allowMethods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
  })
);

app.get("/health", (c) => c.json({ status: "ok", service: "rkyves-api" }));

app.route("/auth", authRoutes);
app.route("/orgs", orgRoutes);
app.route("/", projectRoutes);
app.route("/", serviceRoutes);
app.route("/agent", agentRoutes);
app.route("/", cronRoutes);
app.route("/webhooks", webhookRoutes);
app.route("/workers", workerRoutes);

app.onError((err, c) => {
  console.error(err);
  if (err.name === "ZodError") {
    return c.json({ error: "Validation failed", details: err.message }, 400);
  }
  return c.json({ error: err.message ?? "Internal server error" }, 500);
});

startCronDispatcher();
scheduleDailyBackups();

serve({ fetch: app.fetch, port: config.port }, () => {
  console.log(`Rkyves API listening on http://localhost:${config.port}`);
});

export default app;
