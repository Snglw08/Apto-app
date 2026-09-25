import "server-only";
import { createClient } from "@supabase/supabase-js";
import { getCloudflareContext } from "@opennextjs/cloudflare";

/**
 * Cliente con anon key: respeta Row Level Security.
 * Uso normal en Route Handlers y server components.
 */
export function getSupabaseClient() {
  const { env } = getCloudflareContext();
  return createClient(env.SUPABASE_URL, env.SUPABASE_ANON_KEY);
}

/**
 * Cliente con service_role key: bypasea Row Level Security.
 * Solo para tareas de servidor que lo requieran explícitamente
 * (ej. cron keep-alive, tareas admin). Nunca exponer al cliente.
 */
export function getSupabaseAdminClient() {
  const { env } = getCloudflareContext();
  return createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);
}
