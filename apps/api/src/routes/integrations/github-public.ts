import type { Context } from "hono";
import { prisma } from "@rkyves/db";
import { config } from "../../lib/config.js";
import { fetchInstallationDetails, isGitHubConfigured } from "../../services/github.js";

export function handleGitHubConfigured(c: Context) {
  return c.json({ configured: isGitHubConfigured() });
}

export async function handleGitHubCallback(c: Context) {
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
}
