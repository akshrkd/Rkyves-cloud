import { Hono } from "hono";
import { githubIntegrationRoutes, githubPublicRoutes } from "./github.js";

export const integrationRoutes = new Hono();

integrationRoutes.route("/github", githubPublicRoutes);
integrationRoutes.route("/github", githubIntegrationRoutes);
