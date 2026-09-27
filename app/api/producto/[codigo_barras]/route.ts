import { NextRequest, NextResponse } from "next/server";
import { getCloudflareContext } from "@opennextjs/cloudflare";
import { getSupabaseAdminClient, getSupabaseClient } from "@/lib/supabase/server";

const OFF_USER_AGENT = "Apto/0.1.0 (lunacamilo08@gmail.com)";

/**
 * Caché en el borde para los productos encontrados.
 *
 * `public` autoriza a la CDN de Cloudflare a guardar la respuesta y servírsela
 * a cualquiera. Se puede porque esta respuesta NO está personalizada: devuelve
 * el producto, no el veredicto. El veredicto lo calcula el cliente cruzando
 * esto con las reglas del paciente, que llegan por otra ruta. Si algún día esta
 * ruta devolviera algo específico de un paciente, `public` pasaría a ser un
 * agujero —le serviría los datos de uno a otro— y habría que quitarlo.
 *
 * `s-maxage=3600`: una hora en la CDN (la `s` es de shared). No se usa
 * `max-age` a propósito: cachear en el navegador del usuario es más difícil de
 * invalidar y no hace falta.
 *
 * `stale-while-revalidate=86400`: pasada la hora, la CDN sirve lo viejo al
 * instante y refresca de fondo. Durante 24 horas nadie espera; a lo sumo
 * alguien recibe un dato de hasta una hora.
 *
 * Una hora es despreciable contra el umbral de la regla del semáforo, que recién
 * considera "desactualizado" un dato de más de 2 años. Y `fecha_dato` queda en
 * la fila, así que siempre se sabe de cuándo es el dato real.
 */
const CACHE_PRODUCTO = {
  "Cache-Control": "public, s-maxage=3600, stale-while-revalidate=86400",
};

/**
 * Los 404 y los errores NO se cachean, y no es un detalle: si el "no lo tenemos"
 * quedara cacheado, un producto recién creado por el flujo de OCR seguiría
 * apareciendo como inexistente hasta que expire el TTL — justo después de que
 * el usuario se tomó el trabajo de fotografiar la etiqueta.
 */
function productoEncontrado(cuerpo: Record<string, unknown>) {
  return NextResponse.json(cuerpo, { headers: CACHE_PRODUCTO });
}

/**
 * El caché del borde hay que pedirlo explícitamente.
 *
 * En Cloudflare Workers, el Worker ES el origen: su respuesta no pasa por la
 * capa de caché de la CDN solo por llevar `Cache-Control`. Ese header le habla
 * al navegador y a proxies intermedios, pero para que el centro de datos
 * guarde la respuesta hay que usar la Cache API.
 *
 * `caches.default` no existe fuera de workerd, así que en `next dev` esto
 * devuelve undefined y la ruta funciona igual, solo que sin caché de borde.
 */
function cacheDelBorde(): Cache | undefined {
  return (globalThis as { caches?: { default?: Cache } }).caches?.default;
}

/** Responde y, en paralelo, deja la respuesta en el caché del borde. */
function guardarYResponder(
  cache: Cache | undefined,
  clave: Request,
  cuerpo: Record<string, unknown>,
) {
  const respuesta = productoEncontrado(cuerpo);
  if (cache) {
    // waitUntil: la escritura no debe hacer esperar al usuario, pero tampoco
    // puede quedar a medias si el Worker termina antes.
    getCloudflareContext().ctx.waitUntil(cache.put(clave, respuesta.clone()));
  }
  return respuesta;
}
const OFF_FIELDS =
  "code,product_name,brands,ingredients_text,last_modified_t,states_tags,completeness,data_quality_errors_tags";

type OffCacheRow = {
  codigo_barras: string;
  nombre: string | null;
  marca: string | null;
  ingredientes: string | null;
  last_modified_t: number | null;
  states_tags: string[];
  completeness: number | null;
  data_quality_errors_tags: string[];
  fuente: "off";
  fecha_dato: string;
};

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ codigo_barras: string }> },
) {
  const { codigo_barras: codigoBarrasRaw } = await params;
  const codigoBarras = codigoBarrasRaw?.trim();

  if (!codigoBarras) {
    return NextResponse.json(
      { error: "Código de barras inválido." },
      { status: 400 },
    );
  }

  // Acierto de caché: se responde desde el centro de datos más cercano, sin
  // ejecutar consultas ni viajar a Supabase.
  const cacheBorde = cacheDelBorde();
  const clave = new Request(request.url, { method: "GET" });
  const cacheado = await cacheBorde?.match(clave);
  if (cacheado) return cacheado;

  const supabase = getSupabaseClient();

  // Las dos consultas salen EN PARALELO, no una después de la otra. Cada viaje
  // del Worker a Supabase cuesta ~325ms medidos, y la consulta en sí son
  // milisegundos: lo caro es ir y volver, no buscar (codigo_barras es PRIMARY
  // KEY en ambas tablas, o sea un B-tree con búsqueda exacta). Encadenarlas
  // pagaba esa latencia dos veces para nada.
  //
  // La PRIORIDAD depende de la FUENTE del dato propio, no de la tabla:
  //
  //   manual  ->  off_cache  ->  ocr  ->  la API de OFF
  //
  // El dato cargado a mano es verificado y gana. El de OCR es texto que salió
  // de una foto sin revisar, así que solo llena huecos: nunca tapa un producto
  // que OFF sí tiene.
  //
  // Esto no es estético. La ruta que escribe el OCR
  // (app/api/producto/[codigo_barras]/foto/route.ts) es pública y escribe con
  // service_role, así que cualquiera puede crear una fila para un código real.
  // Cuando el dato de OCR ganaba, eso alcanzaba para dar vuelta un veredicto:
  // medido con calcularVeredicto sobre una leche con lactosa vetada, el dato de
  // OFF daba VETADO y una fila de OCR con los ingredientes cambiados daba
  // NEUTRO, "con moderación, sin problema".
  //
  // La regla 5 protege contra el dato que FALTA. Esto cierra el hueco del dato
  // FALSO, y con el mismo criterio que ya usa esa regla: un dato sin verificar
  // puede vetar, pero no habilita el verde ni pisa al verificado.
  //
  // Esto tampoco fusiona las tablas (regla 6): son dos consultas separadas que
  // devuelven filas de una o de otra, nunca combinadas. La relación sigue
  // siendo solo por código de barras y en tiempo de consulta.
  const [propios, cache] = await Promise.all([
    supabase.from("productos_propios").select("*").eq("codigo_barras", codigoBarras).maybeSingle(),
    supabase.from("off_cache").select("*").eq("codigo_barras", codigoBarras).maybeSingle(),
  ]);

  if (propios.error) {
    return NextResponse.json(
      { error: "Error consultando productos_propios." },
      { status: 500 },
    );
  }
  if (cache.error) {
    return NextResponse.json(
      { error: "Error consultando off_cache." },
      { status: 500 },
    );
  }

  const propio = propios.data as { fuente?: string } | null;

  // 1) Dato propio verificado.
  if (propio && propio.fuente !== "ocr") {
    return guardarYResponder(cacheBorde, clave, {
      encontrado: true,
      origen: "productos_propios",
      producto: propios.data,
    });
  }

  // 2) El caché de OFF le gana al OCR.
  if (cache.data) {
    return guardarYResponder(cacheBorde, clave, {
      encontrado: true,
      origen: "off_cache",
      producto: cache.data,
    });
  }

  // 3) Recién acá el OCR, para llenar el hueco.
  if (propio) {
    return guardarYResponder(cacheBorde, clave, {
      encontrado: true,
      origen: "productos_propios",
      producto: propios.data,
    });
  }

  // No está en ninguna tabla propia: consultar Open Food Facts (API v3).
  const { env } = getCloudflareContext();
  const headers: HeadersInit = { "User-Agent": OFF_USER_AGENT };
  if (env.OFF_API_BASIC_AUTH_USER) {
    headers["Authorization"] =
      `Basic ${btoa(`${env.OFF_API_BASIC_AUTH_USER}:${env.OFF_API_BASIC_AUTH_PASS}`)}`;
  }

  let offResponse: Response;
  try {
    offResponse = await fetch(
      `${env.OFF_API_BASE_URL}/api/v3/product/${encodeURIComponent(codigoBarras)}?fields=${OFF_FIELDS}`,
      { headers },
    );
  } catch {
    return NextResponse.json(
      { error: "No se pudo contactar a Open Food Facts." },
      { status: 502 },
    );
  }

  if (offResponse.status === 404) {
    return NextResponse.json({ encontrado: false }, { status: 404 });
  }
  if (!offResponse.ok) {
    return NextResponse.json(
      { error: "Open Food Facts respondió con error." },
      { status: 502 },
    );
  }

  const { product } = (await offResponse.json()) as {
    product?: {
      product_name?: string;
      brands?: string;
      ingredients_text?: string;
      last_modified_t?: number;
      states_tags?: string[];
      completeness?: number;
      data_quality_errors_tags?: string[];
    };
  };

  if (!product) {
    return NextResponse.json({ encontrado: false }, { status: 404 });
  }

  const nuevoCache: OffCacheRow = {
    codigo_barras: codigoBarras,
    nombre: product.product_name ?? null,
    marca: product.brands ?? null,
    ingredientes: product.ingredients_text ?? null,
    last_modified_t: product.last_modified_t ?? null,
    states_tags: product.states_tags ?? [],
    completeness: product.completeness ?? null,
    data_quality_errors_tags: product.data_quality_errors_tags ?? [],
    fuente: "off",
    fecha_dato: new Date().toISOString(),
  };

  // Escritura con service_role: off_cache la llena esta ruta, no el usuario final.
  const supabaseAdmin = getSupabaseAdminClient();
  const { data: guardado, error: upsertError } = await supabaseAdmin
    .from("off_cache")
    .upsert(nuevoCache, { onConflict: "codigo_barras" })
    .select()
    .maybeSingle();

  if (upsertError) {
    console.error("No se pudo guardar en off_cache:", upsertError.message);
  }

  return guardarYResponder(cacheBorde, clave, {
    encontrado: true,
    origen: "off_cache",
    producto: guardado ?? nuevoCache,
  });
}
