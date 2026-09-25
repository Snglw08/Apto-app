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

  let geminiRes: Response;
  try {
    geminiRes = await fetch(GEMINI_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-goog-api-key": env.GEMINI_API_KEY,
      },
      body: JSON.stringify({
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
      }),
    });
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
