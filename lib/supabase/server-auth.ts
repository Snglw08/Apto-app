import "server-only";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { getCloudflareContext } from "@opennextjs/cloudflare";

/**
 * Cliente de Supabase para Server Components / Route Handlers, con sesión
 * de Auth leída y persistida en cookies. Distinto de lib/supabase/server.ts
 * (ese es para las consultas anon/service_role de off_cache/productos_propios,
 * sin necesidad de sesión de usuario).
 *
 * Lee las credenciales de getCloudflareContext().env, no de process.env: en
 * el runtime de Workers process.env no queda poblado con los "vars" de
 * wrangler.jsonc (a diferencia del bundle de cliente, donde sí se incrustan
 * en build vía .env.production). Usar process.env acá causaba
 * "supabaseUrl is required" en producción.
 */
export async function getSupabaseServerClient() {
  const cookieStore = await cookies();
  const { env } = getCloudflareContext();

  return createServerClient(
    env.NEXT_PUBLIC_SUPABASE_URL,
    env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options),
            );
          } catch {
            // Llamado desde un Server Component sin permiso de escritura;
            // el middleware se encarga de refrescar la cookie en ese caso.
          }
        },
      },
    },
  );
}
