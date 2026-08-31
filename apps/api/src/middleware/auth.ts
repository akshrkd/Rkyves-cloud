import type { Context, Next } from "hono";
import { prisma } from "@rkyves/db";
import { verifyToken } from "../lib/auth.js";
import { hashApiKey } from "../lib/crypto.js";
import { config } from "../lib/config.js";

export type AuthUser = {
  id: string;
  email: string;
  name: string;
};

declare module "hono" {
  interface ContextVariableMap {
    user: AuthUser;
    isAgent: boolean;
  }
}

export async function requireAuth(c: Context, next: Next) {
  const authHeader = c.req.header("Authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return c.json({ error: "Unauthorized" }, 401);
  }

  const token = authHeader.slice(7);

  if (token === config.agentToken) {
    c.set("isAgent", true);
    return next();
  }

  try {
    const payload = await verifyToken(token);
    c.set("user", {
      id: payload.sub,
      email: payload.email,
      name: payload.name,
    });
    c.set("isAgent", false);
    return next();
  } catch {
    const keyHash = hashApiKey(token);
    const apiKey = await prisma.apiKey.findUnique({
      where: { keyHash },
      include: { user: true },
    });

    if (!apiKey || (apiKey.expiresAt && apiKey.expiresAt < new Date())) {
      return c.json({ error: "Unauthorized" }, 401);
    }

    await prisma.apiKey.update({
      where: { id: apiKey.id },
      data: { lastUsedAt: new Date() },
    });

    c.set("user", {
      id: apiKey.user.id,
      email: apiKey.user.email,
      name: apiKey.user.name,
    });
    c.set("isAgent", false);
    return next();
  }
}

export async function requireAgent(c: Context, next: Next) {
  const authHeader = c.req.header("Authorization");
  if (!authHeader?.startsWith("Bearer ") || authHeader.slice(7) !== config.agentToken) {
    return c.json({ error: "Agent unauthorized" }, 401);
  }
  c.set("isAgent", true);
  return next();
}

export async function requireUser(c: Context, next: Next) {
  if (c.get("isAgent")) {
    return c.json({ error: "User auth required" }, 403);
  }
  if (!c.get("user")) {
    return c.json({ error: "Unauthorized" }, 401);
  }
  return next();
}
