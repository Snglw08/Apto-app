// Entrypoint del Worker. Envuelve el worker que genera @opennextjs/cloudflare
// para agregarle un handler `scheduled` que el adapter no expone por sí solo.
//
// Los @ts-ignore de acá abajo no se pueden cambiar por @ts-expect-error:
// `.open-next/worker.js` no existe antes del build, así que el import falla
// en un árbol limpio y deja de fallar después de compilar. @ts-expect-error
// daría error justamente en el segundo caso.
/* eslint-disable @typescript-eslint/ban-ts-comment */

// @ts-ignore `.open-next/worker.js` se genera en build time
import { default as handler } from "./.open-next/worker.js";
import { createClient } from "@supabase/supabase-js";

export default {
  fetch: handler.fetch,

  // Keep-alive: el free tier de Supabase pausa el proyecto a los 7 días sin
  // actividad, y un ping HTTP al dominio no cuenta — tiene que ser un query
  // real contra la base (ver "Cloudflare Workers" en el README).
  //
  // Usa la anon key, no service_role: off_cache tiene lectura pública, así
  // que para mantener el proyecto despierto no hace falta saltear RLS.
  async scheduled(_event, env) {
    const supabase = createClient(env.SUPABASE_URL, env.SUPABASE_ANON_KEY);
    const { error } = await supabase
      .from("off_cache")
      .select("codigo_barras")
      .limit(1);

    if (error) {
      console.error("Keep-alive query falló:", error.message);
    }
  },
} satisfies ExportedHandler<CloudflareEnv>;

// @ts-ignore `.open-next/worker.js` se genera en build time
export { DOQueueHandler, DOShardedTagCache, BucketCachePurge } from "./.open-next/worker.js";
