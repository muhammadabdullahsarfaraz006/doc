import { config as loadDotenv } from "dotenv";
import { hostname } from "node:os";
import { resolve } from "node:path";
import { z } from "zod";

// Load repo-root .env.local then collaboration/.env if present.
loadDotenv({ path: resolve(process.cwd(), "../.env.local") });
loadDotenv({ path: resolve(process.cwd(), ".env") });
loadDotenv({ path: resolve(process.cwd(), ".env.local") });

const envSchema = z.object({
  COLLAB_PORT: z.coerce.number().int().positive().default(1234),
  COLLAB_ALLOWED_ORIGINS: z
    .string()
    .default("http://localhost:3000,http://localhost:3001"),
  COLLAB_INSTANCE_NAME: z.string().min(1).optional(),
  /**
   * Required for multi-instance (Vercel) deployments so Yjs updates and
   * awareness sync across function instances. Optional for single-process local.
   */
  REDIS_URL: z.string().min(1).optional(),
  SUPABASE_URL: z.string().url().optional(),
  NEXT_PUBLIC_SUPABASE_URL: z.string().url().optional(),
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(1).optional(),
  SUPABASE_SECRET_KEY: z.string().min(1).optional(),
  /**
   * When true, refuse to start without REDIS_URL (production multi-instance).
   */
  COLLAB_REQUIRE_REDIS: z
    .enum(["true", "false"])
    .optional()
    .transform((value) => value === "true"),
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  throw new Error(
    `Invalid collaboration server environment: ${parsed.error.message}`,
  );
}

const supabaseUrl =
  parsed.data.SUPABASE_URL ?? parsed.data.NEXT_PUBLIC_SUPABASE_URL;
const serviceRoleKey =
  parsed.data.SUPABASE_SERVICE_ROLE_KEY ?? parsed.data.SUPABASE_SECRET_KEY;

if (!supabaseUrl || !serviceRoleKey) {
  throw new Error(
    "Collaboration server requires SUPABASE_URL (or NEXT_PUBLIC_SUPABASE_URL) and SUPABASE_SERVICE_ROLE_KEY (or SUPABASE_SECRET_KEY).",
  );
}

if (parsed.data.COLLAB_REQUIRE_REDIS && !parsed.data.REDIS_URL) {
  throw new Error(
    "COLLAB_REQUIRE_REDIS=true but REDIS_URL is missing. Multi-instance Vercel deployments require Redis for cross-instance Yjs sync.",
  );
}

export const collabEnv = {
  port: parsed.data.COLLAB_PORT,
  allowedOrigins: parsed.data.COLLAB_ALLOWED_ORIGINS.split(",")
    .map((origin) => origin.trim())
    .filter(Boolean),
  supabaseUrl,
  serviceRoleKey,
  redisUrl: parsed.data.REDIS_URL ?? null,
  instanceName:
    parsed.data.COLLAB_INSTANCE_NAME ??
    `ajaia-collab-${hostname()}-${process.pid}`,
  requireRedis: Boolean(parsed.data.COLLAB_REQUIRE_REDIS),
};
