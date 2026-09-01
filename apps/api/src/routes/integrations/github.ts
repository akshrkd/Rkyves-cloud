import { Hono } from "hono";
import { prisma } from "@rkyves/db";
import { requireAuth, requireUser } from "../../middleware/auth.js";
import { config } from "../../lib/config.js";
import {
  analyzeRepo,
  getInstallUrl,
  getInstallationOctokit,
  isGitHubConfigured,
  listRepos,
  removeWebhook,
} from "../../services/github.js";

export const githubRoutes = new Hono();

githubRoutes.use("*", requireAuth, requireUser);

async function assertOrgAccess(userId: string, orgId: string, minRole?: "admin") {
  const membership = await prisma.orgMember.findFirst({
    where: { userId, organizationId: orgId },
  });
  if (!membership) return null;
  if (minRole === "admin" && membership.role === "member") return null;
  return membership;
}

githubRoutes.get("/status", async (c) => {
  const user = c.get("user");
  const organizationId = c.req.query("organizationId");
  if (!organizationId) return c.json({ error: "organizationId required" }, 400);

  if (!(await assertOrgAccess(user.id, organizationId))) {
    return c.json({ error: "Not found" }, 404);
  }

  const installation = await prisma.gitHubInstallation.findUnique({
    where: { organizationId },
  });

  return c.json({
    configured: isGitHubConfigured(),
    connected: Boolean(installation),
    accountLogin: installation?.accountLogin ?? null,
    accountType: installation?.accountType ?? null,
    installationId: installation?.installationId ?? null,
  });
});

githubRoutes.get("/install-url", async (c) => {
  const user = c.get("user");
  const organizationId = c.req.query("organizationId");
  if (!organizationId) return c.json({ error: "organizationId required" }, 400);

  if (!(await assertOrgAccess(user.id, organizationId, "admin"))) {
    return c.json({ error: "Forbidden" }, 403);
  }

  if (!isGitHubConfigured()) {
    return c.json({ error: "GitHub App is not configured on this server" }, 503);
  }

  return c.json({
    url: getInstallUrl(organizationId),
    callbackUrl: `${config.apiPublicUrl}/integrations/github/callback`,
  });
});

githubRoutes.delete("/", async (c) => {
  const user = c.get("user");
  const organizationId = c.req.query("organizationId");
  if (!organizationId) return c.json({ error: "organizationId required" }, 400);

  if (!(await assertOrgAccess(user.id, organizationId, "admin"))) {
    return c.json({ error: "Forbidden" }, 403);
  }

  const installation = await prisma.gitHubInstallation.findUnique({
    where: { organizationId },
  });
  if (!installation) return c.json({ ok: true, disconnected: false });

  const repoLinks = await prisma.gitHubRepoLink.findMany({
    where: { installationId: installation.installationId },
    include: { service: { include: { project: true } } },
  });

  for (const link of repoLinks) {
    if (link.webhookId) {
      await removeWebhook(link.installationId, link.owner, link.repo, link.webhookId);
    }
  }

  await prisma.gitHubInstallation.delete({ where: { organizationId } });
  return c.json({ ok: true, disconnected: true });
});

githubRoutes.get("/repos", async (c) => {
  const user = c.get("user");
  const organizationId = c.req.query("organizationId");
  const search = c.req.query("search") ?? undefined;
  if (!organizationId) return c.json({ error: "organizationId required" }, 400);

  if (!(await assertOrgAccess(user.id, organizationId))) {
    return c.json({ error: "Not found" }, 404);
  }

  const installation = await prisma.gitHubInstallation.findUnique({
    where: { organizationId },
  });
  if (!installation) {
    return c.json({ error: "GitHub not connected for this organization" }, 400);
  }

  try {
    const repos = await listRepos(installation.installationId, search);
    return c.json({ repos, installationId: installation.installationId });
  } catch (err) {
    console.error("GitHub listRepos failed:", err);
    const message = err instanceof Error ? err.message : "Failed to list GitHub repositories";
    return c.json({ error: message }, 502);
  }
});

githubRoutes.get("/repos/:owner/:repo/analyze", async (c) => {
  const user = c.get("user");
  const organizationId = c.req.query("organizationId");
  const branch = c.req.query("branch") ?? undefined;
  const owner = c.req.param("owner");
  const repo = c.req.param("repo");

  if (!organizationId) return c.json({ error: "organizationId required" }, 400);

  if (!(await assertOrgAccess(user.id, organizationId))) {
    return c.json({ error: "Not found" }, 404);
  }

  const installation = await prisma.gitHubInstallation.findUnique({
    where: { organizationId },
  });
  if (!installation) {
    return c.json({ error: "GitHub not connected for this organization" }, 400);
  }

  const analysis = await analyzeRepo(installation.installationId, owner, repo, branch);
  return c.json({ ...analysis, installationId: installation.installationId });
});

githubRoutes.get("/repos/:owner/:repo/branches", async (c) => {
  const user = c.get("user");
  const organizationId = c.req.query("organizationId");
  const owner = c.req.param("owner");
  const repo = c.req.param("repo");

  if (!organizationId) return c.json({ error: "organizationId required" }, 400);

  if (!(await assertOrgAccess(user.id, organizationId))) {
    return c.json({ error: "Not found" }, 404);
  }

  const installation = await prisma.gitHubInstallation.findUnique({
    where: { organizationId },
  });
  if (!installation) {
    return c.json({ error: "GitHub not connected for this organization" }, 400);
  }

  const octokit = await getInstallationOctokit(installation.installationId);
  const { data } = await octokit.request("GET /repos/{owner}/{repo}/branches", {
    owner,
    repo,
    per_page: 100,
  });
  return c.json({ branches: data.map((b) => b.name) });
});
