import { NextResponse } from "next/server";
import { getCloudflareContext } from "@opennextjs/cloudflare";
import { getSupabaseAdminClient } from "@/lib/supabase/server";

const GEMINI_MODEL = "gemini-3.6-flash";
const GEMINI_URL = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`;

const PROMPT =
  "Esta es una foto de la etiqueta de un producto envasado. Busca la lista de " +
  "ingredientes (suele empezar con 'Ingredientes:' o similar) y transcríbela " +
  "textualmente, tal como aparece impresa, separando los ítems con comas. No " +
  "traduzcas ni resumas. Si la imagen no muestra una lista de ingredientes " +
  "legible, indica ingredientes_legibles en false.";

const RESPONSE_SCHEMA = {
  type: "object",
  properties: {
    ingredientes_legibles: {
      type: "boolean",
      description: "true si se pudo leer una lista de ingredientes en la imagen",
    },
    ingredientes_texto: {
      type: "string",
      description: "el texto de la lista de ingredientes tal como aparece en el envase",
    },
  },
  required: ["ingredientes_legibles", "ingredientes_texto"],
};

const TAMANO_MAXIMO = 20 * 1024 * 1024; // límite de Gemini para datos inline

function bufferABase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binario = "";
  const tamanoChunk = 0x8000;
  for (let i = 0; i < bytes.length; i += tamanoChunk) {
    binario += String.fromCharCode(...bytes.subarray(i, i + tamanoChunk));
  }
  return btoa(binario);
}

/**
 * Un solo reintento ante saturación, y el número está elegido por la cuota, no
 * por la red.
 *
 * El free tier de Gemini da 20 llamadas diarias. Cada reintento las consume
 * igual que un intento bueno, así que reintentar de más convierte un problema
 * de disponibilidad en uno de cuota: con 2 reintentos, un día con el servicio
 * caído se come el presupuesto entero sin haber leído una sola etiqueta.
 *
 * Con 1, un día normal rinde las mismas 20 lecturas que sin reintento —el
 * reintento solo se dispara ante 503— y un día saturado rinde 10, pero esas 10
 * funcionan. La medición mostró que el segundo intento ya resolvía.
 */
const REINTENTOS = 1;
const ESPERA_MS = 900;

/**
 * Llama a Gemini reintentando si responde 503.
 *
 * El 503 de Gemini dice literalmente "This model is currently experiencing high
 * demand. Spikes in demand are usually temporary. Please try again later." —
 * o sea, el propio servicio avisa que es transitorio. Sin reintento, el usuario
 * sacaba la foto, esperaba, y recibía un error por algo que se resolvía solo en
 * un segundo. Medido: el mismo modelo alternaba 503 y 200 minuto a minuto.
 *
 * Solo se reintenta el 503. Un 400 (imagen inválida) o un 403 (key mala) no
 * mejoran esperando: reintentarlos haría esperar al usuario de gusto y, peor,
 * gastaría cuota diaria en un pedido que va a fallar igual.
 *
 * El 429 tampoco se reintenta acá: tiene su propio tratamiento más abajo,
 * porque en el free tier de Gemini suele ser la cuota diaria agotada y esa no
 * se recupera hasta el día siguiente.
 */
async function pedirAGemini(cuerpo: string, apiKey: string): Promise<Response> {
  let respuesta: Response | undefined;

  for (let intento = 0; intento <= REINTENTOS; intento++) {
    if (intento > 0) {
      await new Promise((r) => setTimeout(r, ESPERA_MS));
    }

    respuesta = await fetch(GEMINI_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-goog-api-key": apiKey,
      },
      body: cuerpo,
    });

    if (respuesta.status !== 503) return respuesta;
  }

  // Agotados los reintentos, se devuelve el último 503 para que el llamador
  // arme el mensaje.
  return respuesta as Response;
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ codigo_barras: string }> },
) {
  const { codigo_barras: codigoBarrasRaw } = await params;
  const codigoBarras = codigoBarrasRaw?.trim();

  if (!codigoBarras) {
    return NextResponse.json({ error: "Código de barras inválido." }, { status: 400 });
  }

  const formData = await request.formData().catch(() => null);
  const foto = formData?.get("foto");
  const nombreCrudo = formData?.get("nombre");
  const nombre = typeof nombreCrudo === "string" ? nombreCrudo.trim() : "";

  if (!nombre) {
    return NextResponse.json({ error: "Falta el nombre del producto." }, { status: 400 });
  }
  if (!(foto instanceof File)) {
    return NextResponse.json({ error: "Falta la foto." }, { status: 400 });
  }
  if (foto.size > TAMANO_MAXIMO) {
    return NextResponse.json({ error: "La foto pesa demasiado. Intenta con otra." }, { status: 400 });
  }

  const { env } = getCloudflareContext();
  const base64 = bufferABase64(await foto.arrayBuffer());

  const cuerpo = JSON.stringify({
    contents: [
      {
        role: "user",
        parts: [
          { text: PROMPT },
          { inline_data: { mime_type: foto.type || "image/jpeg", data: base64 } },
        ],
      },
    ],
    generationConfig: {
      responseMimeType: "application/json",
      responseSchema: RESPONSE_SCHEMA,
    },
  });

  let geminiRes: Response;
  try {
    geminiRes = await pedirAGemini(cuerpo, env.GEMINI_API_KEY);
  } catch {
    return NextResponse.json(
      { error: "No pudimos conectar con el servicio de lectura. Revisa tu conexión e intenta de nuevo." },
      { status: 502 },
    );
  }

  if (!geminiRes.ok) {
    if (geminiRes.status === 429) {
      // Cuota diaria gratuita de Gemini agotada (RESOURCE_EXHAUSTED). No se
      // arregla "en un momento" como el resto de los errores 502 de acá
      // abajo — recién al día siguiente, así que necesita su propio mensaje.
      return NextResponse.json(
        { error: "Llegamos al límite diario de lecturas por hoy. Vuelve a intentar mañana." },
        { status: 503 },
      );
    }
    if (geminiRes.status === 503) {
      // Saturación del modelo, ya reintentada sin éxito (ver pedirAGemini).
      // Merece su propio mensaje: no es que algo esté roto ni que la foto esté
      // mal, es que hay que esperar. Decírselo al usuario evita que saque la
      // foto cinco veces pensando que el problema es su encuadre.
      return NextResponse.json(
        {
          error:
            "El servicio de lectura está saturado en este momento. No es tu foto: espera un minuto y vuelve a intentar.",
        },
        { status: 503 },
      );
    }
    return NextResponse.json(
      { error: "El servicio de lectura no respondió. Intenta de nuevo en un momento." },
      { status: 502 },
    );
  }

  const geminiData = (await geminiRes.json().catch(() => null)) as {
    candidates?: { content?: { parts?: { text?: string }[] } }[];
  } | null;

  const textoJson = geminiData?.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!textoJson) {
    return NextResponse.json(
      { error: "No pudimos leer la foto. Intenta con más luz y mejor encuadre." },
      { status: 422 },
    );
  }

  let extraido: { ingredientes_legibles?: boolean; ingredientes_texto?: string };
  try {
    extraido = JSON.parse(textoJson);
  } catch {
    return NextResponse.json(
      { error: "No pudimos leer la foto. Intenta de nuevo." },
      { status: 422 },
    );
  }

  const ingredientes = extraido.ingredientes_texto?.trim();
  if (!extraido.ingredientes_legibles || !ingredientes) {
    return NextResponse.json(
      {
        error:
          "No encontramos una lista de ingredientes legible en la foto. Prueba con más luz o acercando la cámara.",
      },
      { status: 422 },
    );
  }

  // Solo se guarda el texto extraído — nunca la imagen. service_role: esta
  // ruta es la única que escribe en productos_propios vía OCR.
  const admin = getSupabaseAdminClient();
  const { data: guardado, error } = await admin
    .from("productos_propios")
    .upsert(
      {
        codigo_barras: codigoBarras,
        nombre,
        ingredientes,
        fuente: "ocr",
        fecha_dato: new Date().toISOString(),
      },
      { onConflict: "codigo_barras" },
    )
    .select()
    .single();

  if (error || !guardado) {
    return NextResponse.json({ error: "No pudimos guardar el producto." }, { status: 500 });
  }

  return NextResponse.json({ producto: guardado });
}
