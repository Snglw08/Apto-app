# CLAUDE.md — Apto

Fuente de verdad del proyecto. Si una instrucción puntual contradice una regla dura
de este archivo, detenerse y señalarlo antes de escribir código.

El **README.md** explica el porqué de cada decisión y está escrito para alguien de
afuera (reclutador o desarrollador que llega al repo). Este archivo es el contrato
de trabajo. Si una decisión cambia acá, el README tiene que reflejarlo.

## Qué es esto

PWA instalable. Un paciente escanea el código de barras de un producto y ve un
veredicto en tres estados — **vetado**, **neutro** o **recomendado** — según las
reglas alimentarias que su nutricionista definió para él. Si el dato no alcanza,
el estado es **"datos incompletos"** y se ofrece leer la etiqueta por foto (OCR).

- **Stack:** Next.js 16 (App Router) + TypeScript estricto + Supabase (free tier).
- **Deploy:** Cloudflare Workers vía `@opennextjs/cloudflare`. **Nunca Vercel.**
- **Fuente externa de productos:** Open Food Facts (OFF), licencia ODbL.
- **OCR de etiquetas:** Gemini, solo server-side.
- **Naturaleza:** proyecto de portafolio. Datos de demostración únicamente.

## Origen del repo — leer antes de tocar nada

Este repo es una versión de portafolio, reconstruida desde cero a partir de un MVP
que se desarrolló como proyecto para un cliente. El repo del cliente es **otro**,
con otro historial, y vive aparte.

**Regla dura: nada del proyecto del cliente entra acá.** Ni su nombre, ni su RUT,
ni sus correos, ni su URL de Supabase o de Workers, ni el ID de su KV namespace, ni
documentos comerciales (cotizaciones, actas de entrega), ni sus pacientes reales, ni
sus iconos o logo. El historial de git de este repo empieza limpio a propósito y
tiene que seguir así.

Antes de cualquier commit que traiga archivos desde el repo original, correr el
barrido de `PENDIENTES.md` (sección "Barrido de datos sensibles").

## Comandos

```bash
npm run dev         # next dev — iteración rápida (runtime Node, no workerd)
npm run build       # next build --webpack
npm run preview     # opennextjs-cloudflare build && preview — runtime real
npm run deploy      # opennextjs-cloudflare build && deploy
npm run lint        # eslint — tiene que quedar en cero
npm run cf-typegen  # regenera cloudflare-env.d.ts desde wrangler.jsonc + .dev.vars
```

- Secretos: `npx wrangler secret put NOMBRE` (prod) y `.dev.vars` (local, gitignored).
- Antes de dar una feature por terminada, correr `npm run preview`: `next dev` corre
  en Node y esconde errores propios de workerd.
- `npm run cf-typegen` después de tocar `wrangler.jsonc` o agregar variables.

## Reglas duras (no negociables)

### Open Food Facts

1. **Siempre API v3.** La v2 está deprecada. No escribir llamadas a v2 ni "corregir"
   código hacia v2.
2. **Toda llamada a OFF pasa por un Route Handler** (`app/api/*/route.ts`) con header
   `User-Agent` propio, formato `Apto/x.y (email-de-contacto)`. El navegador no puede
   setear `User-Agent` (header prohibido), así que el fetch desde el cliente está
   descartado por el protocolo, no por preferencia. La respuesta se persiste en
   `off_cache` con `fuente` y `fecha_dato`.
3. **En desarrollo apuntar al staging** `https://world.openfoodfacts.net` con Basic
   Auth `off` / `off`. Producción: `world.openfoodfacts.org`. La base URL sale de una
   variable de entorno, nunca hardcodeada.
4. **Atribución visible a Open Food Facts** en toda pantalla que muestre sus datos,
   más el disclaimer de que son datos colaborativos que pueden estar incompletos o
   desactualizados.

### Semáforo — fallar hacia el lado seguro

5. El semáforo **NUNCA muestra verde** si el dato proviene de OFF y se cumple
   cualquiera de estas condiciones:
   - `states_tags` no incluye `en:ingredients-completed`
   - `last_modified_t` tiene más de 2 años de antigüedad
   - `data_quality_errors_tags` incluye algún error **sobre los ingredientes**
     (un tag que contenga `ingredient`). Los errores sobre la tabla nutricional
     NO descalifican: el veredicto se calcula solo con el texto de ingredientes
     y la tabla no se lee nunca. Medido sobre 1000 productos del cache, 32 de
     los 33 tipos de error de OFF son sobre nutrición; mirarlos todos llevaba al
     11% de los productos a "datos incompletos" sin motivo.

   En esos casos el estado es **"datos incompletos"** y la UI ofrece el flujo de foto.
   Un producto con `fuente: 'ocr'` puede **vetar** pero nunca **recomendar**: dato sin
   verificar no habilita el verde. Ante la duda, jamás declarar un producto apto.

   → `lib/veredicto.ts`, función `calcularVeredicto`. Tests en `lib/veredicto.test.ts`:
   si esta regla cambia, esos tests tienen que cambiar a propósito.

### Datos y licencia ODbL

6. **Tres grupos de tablas separados. Jamás fusionarlos:**
   - `productos_propios` — dato propio (OCR y carga manual)
   - `off_cache` — cache de Open Food Facts (licencia ODbL)
   - tablas del circuito clínico (nutricionistas, pacientes, reglas, asignaciones)

   Prohibido copiar campos de `off_cache` a `productos_propios` o viceversa, y
   prohibido "rellenar huecos" de una tabla con la otra. Mezclar dato OFF con dato
   propio crea una base derivada y el share-alike de ODbL obligaría a publicar la
   base completa. La relación entre ambas es solo por código de barras, en tiempo de
   consulta.
7. Toda fila de producto (en ambas tablas) lleva columnas **`fuente`**
   (`off` | `ocr` | `manual`) y **`fecha_dato`**.
8. **Datos semilla en `supabase/seed.sql` versionado.** El free tier de Supabase no
   tiene backups: el seed es la única forma de reconstruir el estado. Mantenerlo
   idempotente (IDs fijos + `ON CONFLICT`).
9. **Solo datos ficticios.** Nombres, diagnósticos y reglas: todo inventado. Nunca
   datos reales de ninguna persona.

### Secretos

10. La API key de Gemini vive **solo en server routes**. Jamás en el cliente, jamás
    con prefijo `NEXT_PUBLIC_`, jamás en el bundle. Local: `.dev.vars`. Prod:
    `wrangler secret put GEMINI_API_KEY`.
11. **Ningún archivo `.env*` ni `.dev.vars` se versiona.** Solo las plantillas
    `.env.example` y `.dev.vars.example`, sin valores. Las claves de Supabase en
    `wrangler.jsonc` son placeholders (`TU-PROYECTO`, `TU_KEY`, `TU_KV_NAMESPACE_ID`)
    y tienen que seguir siéndolo en lo que se commitea.

### Cloudflare Workers / OpenNext

12. **Build con `opennextjs-cloudflare build`, deploy con `opennextjs-cloudflare
    deploy`.** Nunca `next build` a secas, nunca `next start`, nunca `vercel.json` ni
    ninguna configuración de Vercel en el repo.
13. `wrangler.jsonc` con `"compatibility_flags": ["nodejs_compat"]` y
    `"compatibility_date": "2024-09-23"` o posterior. Sin ambas cosas la app no
    arranca.
14. `next/image`: `images: { unoptimized: true }` en `next.config.ts`. El loader por
    defecto apunta al optimizador de Vercel y el build falla.
15. `npm run build` usa **`--webpack`** a propósito. Con Turbopack (default en Next 16)
    el build de `@opennextjs/cloudflare` genera un worker roto (`ChunkLoadError`, 500
    en runtime). Quitar el flag solo cuando el adapter soporte Turbopack, y
    verificándolo con `npm run preview`.
16. El **cron keep-alive va como Cron Trigger en `wrangler.jsonc`** (`triggers.crons`).
    El handler `scheduled` se agrega envolviendo el worker generado por OpenNext en
    `custom-worker.ts`.
17. **Bundle del Worker < 3 MiB comprimido** (límite del free tier). Vigilar
    dependencias pesadas; preferir `fetch` directo a SDKs grandes cuando el resultado
    sea el mismo (así se resolvió Gemini). Revisar el tamaño que reporta wrangler en
    cada deploy.
18. **Binding de KV para el cache incremental** (`NEXT_INC_CACHE_KV`) declarado en
    `wrangler.jsonc`. Hoy `open-next.config.ts` **no** lo habilita — es una
    inconsistencia conocida, anotada en el README. Antes de habilitarlo, verificar
    contra la doc oficial de `@opennextjs/cloudflare`.

### Supabase

19. **Cron keep-alive cada 3 días** que ejecute un query real contra la base. El free
    tier pausa el proyecto a los 7 días sin actividad y un ping HTTP no cuenta.
20. RLS filtra **filas**, no la **forma** de la consulta. Nunca resolver con una policy
    de lectura pública algo que en realidad necesita un endpoint acotado: una policy
    anónima sobre `pacientes` permitiría `select *` y devolvería todos. Ver
    `app/api/vinculacion/route.ts` y la migración `20260725000001`.

### Diseño

21. **Ningún CSS Module declara un color opaco ni un radio en px.** Todo sale de los
    tokens de `app/globals.css`. Si hace falta un valor nuevo, se agrega como token,
    no inline. Lo único admitido inline son `rgba()` translúcidos neutros (negro o
    blanco con alfa) para sombras y overlays.
22. Los tokens del semáforo van en tríos: sólido, `-bg` (tinte del badge) y `-fg`
    (texto sobre ese tinte). El `-fg` es más oscuro que el sólido porque el sólido no
    llega a 4.5:1 sobre su propio tinte. Respetar eso al agregar estados.

## Fuera de alcance — NO construir

- Publicación en tiendas de apps (la PWA instalable alcanza)
- Bloc de notas con NLP
- Directorio de profesionales
- Sistema de validación de aportes
- Manejo de datos reales de pacientes

Si una tarea parece requerir algo de esta lista, parar y preguntar antes de escribir
código.

## Convenciones

- TypeScript estricto, App Router, server routes en `app/api/*/route.ts`.
- Migraciones en `supabase/migrations/`, semilla en `supabase/seed.sql`. Todo
  versionado y en orden.
- UI en español (público chileno). Respetar los nombres de tablas y columnas
  (`productos_propios`, `off_cache`, `fuente`, `fecha_dato`).
- `npm run lint` y `npx tsc --noEmit` tienen que quedar en cero antes de commitear.
- Si OFF, OpenNext o wrangler cambian de versión, verificar contra la doc oficial
  antes de asumir comportamiento.
