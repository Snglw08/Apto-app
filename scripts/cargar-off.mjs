/**
 * Precarga `off_cache` con el catálogo de Open Food Facts de un país.
 *
 *   node scripts/cargar-off.mjs [--pais=chile] [--solo-completos] [--limite=N] [--desde=N]
 *
 * Por qué existe: el caché se llena solo al escanear (ver la ruta
 * app/api/producto/[codigo_barras]/route.ts), pero eso significa que el PRIMER
 * escaneo de cada producto depende de una ida a los servidores de OFF. En un
 * pasillo de supermercado con señal mala, esa ida es la diferencia entre que la
 * app responda o no. Precargar el catálogo del país convierte cada escaneo en
 * una consulta a la base propia.
 *
 * Sobre la licencia: esto NO fusiona nada. Escribe únicamente en `off_cache`,
 * que es la zona ODbL del esquema, con `fuente: 'off'`. `productos_propios`
 * no se toca. La atribución visible a OFF ya la hace la ficha de producto
 * cuando el origen es off_cache. Ver la regla 6 de CLAUDE.md.
 *
 * Buen ciudadano con OFF: usa el User-Agent del proyecto, pide de a 100 (el
 * máximo que admite su API) y espera entre páginas. Son ~68 requests para el
 * catálogo chileno completo, no 6771.
 *
 * ⚠️ El mapeo de campos de acá abajo tiene que coincidir con el de
 * app/api/producto/[codigo_barras]/route.ts. Si allá se agrega un campo a
 * OFF_FIELDS, agregarlo acá también o el caché quedará con filas incompletas
 * según de dónde vinieron.
 */

import { readFileSync } from "node:fs";

const USER_AGENT = "Apto/0.1.0 (lunacamilo08@gmail.com)";
const OFF_BASE = "https://world.openfoodfacts.org";
const CAMPOS =
  "code,product_name,brands,ingredients_text,last_modified_t,states_tags,completeness,data_quality_errors_tags";
const POR_PAGINA = 100; // máximo que admite la API de OFF
const PAUSA_MS = 1200; // entre páginas, para no castigar un servidor comunitario
const LOTE_UPSERT = 500;

const args = Object.fromEntries(
  process.argv.slice(2).map((a) => {
    const [k, v] = a.replace(/^--/, "").split("=");
    return [k, v ?? true];
  }),
);
const PAIS = args.pais ?? "chile";
const SOLO_COMPLETOS = Boolean(args["solo-completos"]);
const LIMITE = args.limite ? Number(args.limite) : Infinity;
// OFF corta las búsquedas masivas anónimas con un 401 (se vio a la página 11).
// --desde permite retomar donde quedó sin volver a pedir lo ya cargado.
const DESDE = args.desde ? Number(args.desde) : 1;

// --- credenciales, desde .dev.vars ------------------------------------------
function leerDevVars() {
  const txt = readFileSync(new URL("../.dev.vars", import.meta.url), "utf8");
  return Object.fromEntries(
    txt
      .split("\n")
      .filter((l) => l.trim() && !l.trim().startsWith("#") && l.includes("="))
      .map((l) => {
        const i = l.indexOf("=");
        return [l.slice(0, i).trim(), l.slice(i + 1).trim()];
      }),
  );
}

const env = leerDevVars();
const SUPABASE_URL = env.SUPABASE_URL;
const SERVICE_KEY = env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SERVICE_KEY) {
  console.error("Falta SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY en .dev.vars");
  process.exit(1);
}

const dormir = (ms) => new Promise((r) => setTimeout(r, ms));

/** Una página del catálogo. Reintenta ante 429/5xx, que OFF devuelve seguido. */
async function traerPagina(pagina, intento = 1) {
  const filtros = [
    `countries_tags_en=${encodeURIComponent(PAIS)}`,
    SOLO_COMPLETOS ? "states_tags=en:ingredients-completed" : "",
  ]
    .filter(Boolean)
    .join("&");

  const url = `${OFF_BASE}/api/v2/search?${filtros}&fields=${CAMPOS}&page_size=${POR_PAGINA}&page=${pagina}`;
  const res = await fetch(url, { headers: { "User-Agent": USER_AGENT } });

  if (!res.ok) {
    if (intento <= 4) {
      const espera = PAUSA_MS * 2 ** intento;
      console.log(`    HTTP ${res.status}, reintento ${intento} en ${espera}ms…`);
      await dormir(espera);
      return traerPagina(pagina, intento + 1);
    }
    if (res.status === 401 || res.status === 403) {
      const e = new Error(`OFF cortó la paginación con ${res.status} en la página ${pagina}`);
      e.pagina = pagina;
      e.esBloqueo = true;
      throw e;
    }
    throw new Error(`OFF respondió ${res.status} en la página ${pagina}`);
  }
  return res.json();
}

/**
 * Mismo mapeo que la ruta: los nombres de columna son los del esquema en
 * español, los de OFF vienen en inglés.
 */
function aFilaDeCache(p) {
  return {
    codigo_barras: String(p.code),
    nombre: p.product_name || null,
    marca: p.brands || null,
    ingredientes: p.ingredients_text || null,
    last_modified_t: p.last_modified_t ?? null,
    states_tags: p.states_tags ?? [],
    completeness: p.completeness ?? null,
    data_quality_errors_tags: p.data_quality_errors_tags ?? [],
    fuente: "off",
    fecha_dato: new Date().toISOString(),
  };
}

async function guardar(filas) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/off_cache?on_conflict=codigo_barras`, {
    method: "POST",
    headers: {
      apikey: SERVICE_KEY,
      Authorization: `Bearer ${SERVICE_KEY}`,
      "Content-Type": "application/json",
      Prefer: "resolution=merge-duplicates,return=minimal",
    },
    body: JSON.stringify(filas),
  });
  if (!res.ok) throw new Error(`Supabase ${res.status}: ${(await res.text()).slice(0, 300)}`);
}

// --- main -------------------------------------------------------------------
console.log(`Catálogo: ${PAIS}${SOLO_COMPLETOS ? " (solo con ingredientes completos)" : ""}`);

const primera = await traerPagina(1);
const total = Math.min(primera.count ?? 0, LIMITE);
const paginas = Math.ceil(total / POR_PAGINA);
console.log(`${primera.count} productos en OFF, se van a cargar ${total} en ${paginas} páginas\n`);

let pendientes = [];
let guardados = 0;
let sinCodigo = 0;

for (let pagina = DESDE; pagina <= paginas; pagina++) {
  const datos = pagina === 1 ? primera : await traerPagina(pagina);
  const productos = datos.products ?? [];

  for (const p of productos) {
    if (!p.code) {
      sinCodigo++;
      continue;
    }
    if (guardados + pendientes.length >= LIMITE) break;
    pendientes.push(aFilaDeCache(p));
  }

  if (pendientes.length >= LOTE_UPSERT || pagina === paginas) {
    // Un mismo código puede venir repetido entre páginas; el upsert de
    // Postgres falla si el MISMO lote trae duplicados, así que se deduplica
    // acá antes de mandar.
    const unicos = [...new Map(pendientes.map((f) => [f.codigo_barras, f])).values()];
    await guardar(unicos);
    guardados += unicos.length;
    pendientes = [];
  }

  const pct = Math.round((pagina / paginas) * 100);
  process.stdout.write(`\r  página ${pagina}/${paginas} (${pct}%) — ${guardados} guardados   `);

  if (guardados >= LIMITE) break;
  if (pagina < paginas) await dormir(PAUSA_MS);
}

console.log(`\n\n${guardados} productos en off_cache${sinCodigo ? ` (${sinCodigo} sin código, salteados)` : ""}`);
