import { streamSSE } from "hono/streaming";
import { Hono } from "hono";
import { requireAuth, requireUser } from "../middleware/auth.js";
import { getOrgMembership } from "../lib/audit.js";
import { subscribeOrgEvents } from "../lib/events.js";

export const eventRoutes = new Hono();

eventRoutes.use("*", requireAuth, requireUser);

eventRoutes.get("/stream", async (c) => {
  const user = c.get("user");
  const orgId = c.req.query("organizationId");
  if (!orgId) return c.json({ error: "organizationId required" }, 400);

  const membership = await getOrgMembership(user.id, orgId);
  if (!membership) return c.json({ error: "Not found" }, 404);

  return streamSSE(c, async (stream) => {
    const unsubscribe = subscribeOrgEvents(orgId, (data) => {
      stream.writeSSE({ data });
    });

    stream.onAbort(() => {
      unsubscribe();
    });

    while (true) {
      await stream.writeSSE({ event: "ping", data: String(Date.now()) });
      await stream.sleep(25000);
    }
  });
});
