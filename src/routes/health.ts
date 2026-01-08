import { Hono } from "hono";
import { getConfig } from "../config";
import { getRouter } from "../services/decision";

export const healthRoutes = new Hono();

healthRoutes.get("/health", async (c) => {
  const config = getConfig();
  const router = getRouter();
  const health = await router.healthCheck();
  const isHealthy = health.presidio;

  const services: Record<string, string> = {
    presidio: health.presidio ? "up" : "down",
  };

  if (config.mode === "route") {
    services.local_llm = health.local ? "up" : "down";
  }

  return c.json(
    {
      status: isHealthy ? "healthy" : "degraded",
      services,
      timestamp: new Date().toISOString(),
    },
    isHealthy ? 200 : 503,
  );
});
