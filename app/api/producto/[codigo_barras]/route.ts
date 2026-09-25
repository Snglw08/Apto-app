import { NextRequest, NextResponse } from "next/server";
import { getCloudflareContext } from "@opennextjs/cloudflare";
import { getSupabaseAdminClient, getSupabaseClient } from "@/lib/supabase/server";

const OFF_USER_AGENT = "Apto/0.1.0 (lunacamilo08@gmail.com)";
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
  _request: NextRequest,
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

  const supabase = getSupabaseClient();

  const { data: propio, error: propioError } = await supabase
    .from("productos_propios")
    .select("*")
    .eq("codigo_barras", codigoBarras)
    .maybeSingle();

  if (propioError) {
    return NextResponse.json(
      { error: "Error consultando productos_propios." },
      { status: 500 },
    );
  }
  if (propio) {
    return NextResponse.json({
      encontrado: true,
      origen: "productos_propios",
      producto: propio,
    });
  }

  const { data: cacheado, error: cacheError } = await supabase
    .from("off_cache")
    .select("*")
    .eq("codigo_barras", codigoBarras)
    .maybeSingle();

  if (cacheError) {
    return NextResponse.json(
      { error: "Error consultando off_cache." },
      { status: 500 },
    );
  }
  if (cacheado) {
    return NextResponse.json({
      encontrado: true,
      origen: "off_cache",
      producto: cacheado,
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

  return NextResponse.json({
    encontrado: true,
    origen: "off_cache",
    producto: guardado ?? nuevoCache,
  });
}
