import { Hono } from "hono";
import { githubRoutes } from "./github.js";

export const integrationRoutes = new Hono();

integrationRoutes.route("/github", githubRoutes);
