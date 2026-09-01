import { Hono } from "hono";
import { prisma } from "@rkyves/db";
import { requireAuth, requireUser } from "../../middleware/auth.js";
import { config } from "../../lib/config.js";
import {
  analyzeRepo,
  fetchInstallationDetails,
  getInstallUrl,
  getInstallationOctokit,
  isGitHubConfigured,
  listRepos,
  removeWebhook,
} from "../../services/github.js";

export const githubIntegrationRoutes = new Hono();
export const githubPublicRoutes = new Hono();

githubPublicRoutes.get("/configured", (c) => {
  return c.json({ configured: isGitHubConfigured() });
});

githubPublicRoutes.get("/callback", async (c) => {
  const installationIdRaw = c.req.query("installation_id");
  const state = c.req.query("state");
  const setupAction = c.req.query("setup_action");

  if (!installationIdRaw || !state) {
    return c.redirect(`${config.corsOrigin}/dashboard/settings/integrations?error=missing_params`);
  }

  const installationId = parseInt(installationIdRaw, 10);
  if (Number.isNaN(installationId)) {
    return c.redirect(`${config.corsOrigin}/dashboard/settings/integrations?error=invalid_installation`);
  }

  if (setupAction === "request") {
    return c.redirect(
      `${config.corsOrigin}/dashboard/settings/integrations?pending=1&organizationId=${state}`
    );
  }

  try {
    const details = await fetchInstallationDetails(installationId);
    await prisma.gitHubInstallation.upsert({
      where: { organizationId: state },
      update: {
        installationId: details.installationId,
        accountLogin: details.accountLogin,
        accountType: details.accountType,
      },
      create: {
        organizationId: state,
        installationId: details.installationId,
        accountLogin: details.accountLogin,
        accountType: details.accountType,
      },
    });
  } catch (err) {
    console.error("GitHub callback failed:", err);
    return c.redirect(`${config.corsOrigin}/dashboard/settings/integrations?error=callback_failed`);
  }

  return c.redirect(
    `${config.corsOrigin}/dashboard/settings/integrations?connected=1&organizationId=${state}`
  );
});

githubIntegrationRoutes.use("*", requireAuth, requireUser);

async function assertOrgAccess(userId: string, orgId: string, minRole?: "admin") {
  const membership = await prisma.orgMember.findFirst({
    where: { userId, organizationId: orgId },
  });
  if (!membership) return null;
  if (minRole === "admin" && membership.role === "member") return null;
  return membership;
}

githubIntegrationRoutes.get("/status", async (c) => {
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

githubIntegrationRoutes.get("/install-url", async (c) => {
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

githubIntegrationRoutes.delete("/", async (c) => {
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

githubIntegrationRoutes.get("/repos", async (c) => {
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

  const repos = await listRepos(installation.installationId, search);
  return c.json({ repos, installationId: installation.installationId });
});

githubIntegrationRoutes.get("/repos/:owner/:repo/analyze", async (c) => {
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

githubIntegrationRoutes.get("/repos/:owner/:repo/branches", async (c) => {
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
  const { data } = await octokit.repos.listBranches({ owner, repo, per_page: 100 });
  return c.json({ branches: data.map((b) => b.name) });
});
