/**
 * Precarga `off_cache` con el catálogo de Open Food Facts de un país.
 *
 *   node scripts/cargar-off.mjs [--pais=chile] [--solo-completos] [--limite=N]
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

/**
 * El catálogo se recorre POR TRAMOS, no de corrido, y esa es la parte que
 * importa entender.
 *
 * OFF permite paginar hasta ~10 páginas (1000 productos) por consulta; más
 * allá responde 401. Medido: con una sola consulta de "todo Chile" se corta en
 * la página 11. La salida no es insistir —es un servidor comunitario— sino
 * partir la consulta en tramos que quepan cada uno en ese límite.
 *
 * La nota nutricional sirve bien como eje de partición: es un campo que OFF
 * indexa, cubre todo el catálogo (los productos sin nota caen en 'unknown') y
 * ningún tramo pasa de 9 páginas para Chile.
 */
const TRAMOS = ["a", "b", "c", "d", "e", "unknown"];

/** Una página de un tramo. Reintenta ante 429/5xx, que OFF devuelve seguido. */
async function traerPagina(pagina, tramo, intento = 1) {
  const filtros = [
    `countries_tags_en=${encodeURIComponent(PAIS)}`,
    SOLO_COMPLETOS ? "states_tags=en:ingredients-completed" : "",
    tramo ? `nutrition_grades_tags=${tramo}` : "",
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
      return traerPagina(pagina, tramo, intento + 1);
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
console.log(`Recorrido por ${TRAMOS.length} tramos, para no pasar el límite de paginación de OFF
`);

let guardados = 0;
let sinCodigo = 0;
const vistos = new Set();

for (const tramo of TRAMOS) {
  let primera;
  try {
    primera = await traerPagina(1, tramo);
  } catch (e) {
    console.log(`
  tramo ${tramo}: no se pudo abrir (${e.message}), se saltea`);
    continue;
  }

  const total = primera.count ?? 0;
  const paginas = Math.ceil(total / POR_PAGINA);
  if (!total) {
    console.log(`  tramo ${tramo}: vacío`);
    continue;
  }

  let pendientes = [];
  let corto = false;

  for (let pagina = 1; pagina <= paginas; pagina++) {
    let datos;
    try {
      datos = pagina === 1 ? primera : await traerPagina(pagina, tramo);
    } catch (e) {
      // Un tramo que se corta no debe tirar abajo los demás: se guarda lo que
      // haya y se sigue con el siguiente.
      console.log(`
  tramo ${tramo}: cortado en la página ${pagina} (${e.message})`);
      corto = true;
      break;
    }

    for (const prod of datos.products ?? []) {
      if (!prod.code) {
        sinCodigo++;
        continue;
      }
      // Un producto puede aparecer en más de un tramo si OFF le cambia la nota
      // entre consultas. Se descarta acá para no mandarlo dos veces.
      if (vistos.has(String(prod.code))) continue;
      vistos.add(String(prod.code));
      pendientes.push(aFilaDeCache(prod));
    }

    if (pendientes.length >= LOTE_UPSERT) {
      await guardar(pendientes);
      guardados += pendientes.length;
      pendientes = [];
    }

    process.stdout.write(
      `
  tramo ${tramo}: página ${pagina}/${paginas} — ${guardados + pendientes.length} productos   `,
    );
    if (guardados + pendientes.length >= LIMITE) break;
    if (pagina < paginas) await dormir(PAUSA_MS);
  }

  if (pendientes.length) {
    await guardar(pendientes);
    guardados += pendientes.length;
  }
  console.log(`
  tramo ${tramo}: ${paginas} páginas, ${guardados} acumulados${corto ? " (cortado)" : ""}        `);

  if (guardados >= LIMITE) break;
  await dormir(PAUSA_MS);
}

console.log(`
${guardados} productos en off_cache${sinCodigo ? ` (${sinCodigo} sin código, salteados)` : ""}`);
