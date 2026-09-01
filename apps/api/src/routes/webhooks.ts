import { createHmac, timingSafeEqual } from "crypto";
import { Hono } from "hono";
import { prisma } from "@rkyves/db";
import { decrypt } from "../lib/crypto.js";
import { config } from "../lib/config.js";
import { triggerServiceDeploy } from "../services/deploy.js";

export const webhookRoutes = new Hono();

function verifyGitHubSignature(
  payload: string,
  signature: string | undefined,
  secret: string
): boolean {
  if (!signature?.startsWith("sha256=")) return false;
  const digest = createHmac("sha256", secret).update(payload).digest("hex");
  const expected = `sha256=${digest}`;
  try {
    return timingSafeEqual(Buffer.from(signature), Buffer.from(expected));
  } catch {
    return false;
  }
}

webhookRoutes.post("/github/app", async (c) => {
  const rawBody = await c.req.text();
  const signature = c.req.header("X-Hub-Signature-256");
  if (!verifyGitHubSignature(rawBody, signature, config.github.webhookSecret)) {
    return c.json({ error: "Invalid signature" }, 401);
  }
  const event = c.req.header("X-GitHub-Event");
  if (event === "ping") {
    return c.json({ ok: true, message: "pong" });
  }
  return c.json({ ok: true, skipped: true });
});

webhookRoutes.post("/github/:serviceId", async (c) => {
  const serviceId = c.req.param("serviceId");
  const event = c.req.header("X-GitHub-Event");
  const rawBody = await c.req.text();

  const repoLink = await prisma.gitHubRepoLink.findUnique({
    where: { serviceId },
  });

  const webhookSecret = repoLink
    ? decrypt(repoLink.webhookSecret)
    : config.github.webhookSecret;

  const signature = c.req.header("X-Hub-Signature-256");
  if (!verifyGitHubSignature(rawBody, signature, webhookSecret)) {
    return c.json({ error: "Invalid signature" }, 401);
  }

  const payload = JSON.parse(rawBody) as Record<string, unknown>;

  if (event === "ping") {
    return c.json({ ok: true, message: "pong" });
  }

  if (event !== "push") return c.json({ ok: true, skipped: true });

  const service = await prisma.service.findUnique({
    where: { id: serviceId },
    include: { project: true },
  });
  if (!service || service.type !== "web") {
    return c.json({ error: "Not found" }, 404);
  }

  const ref = payload.ref as string;
  const gitRef = ref?.replace("refs/heads/", "") ?? "main";
  const serviceConfig = service.config as Record<string, unknown>;
  const expectedBranch = (serviceConfig.gitBranch as string) ?? "main";

  if (gitRef !== expectedBranch) {
    return c.json({ ok: true, skipped: true, reason: "branch mismatch" });
  }

  const gitCommit = payload.after as string;

  const deployment = await triggerServiceDeploy(service.id, { gitRef });
  await prisma.deployment.update({
    where: { id: deployment.id },
    data: { gitCommit },
  });

  return c.json({ ok: true, deploymentId: deployment.id });
});
