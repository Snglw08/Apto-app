import { NextResponse } from "next/server";
import { getCloudflareContext } from "@opennextjs/cloudflare";
import { getSupabaseAdminClient } from "@/lib/supabase/server";

// Ruta pública (sin sesión): valida un código de invitación por lookup
// EXACTO únicamente. No expone ningún endpoint de listado/búsqueda parcial
// sobre pacientes, y devuelve solo el mínimo necesario para el preview de
// vinculación (nombre del paciente y del nutricionista) — nunca diagnóstico
// ni ningún otro dato. Ver comentario en la migración 20260725000001 sobre
// por qué esto NO es una policy pública de RLS.
//
// Código de 4 caracteres, ~924.000 combinaciones: no alcanza para resistir
// fuerza bruta por sí solo, así que además se limita por IP (ver wrangler.jsonc).
export async function POST(request: Request) {
  const { env } = getCloudflareContext();
  const ip = request.headers.get("cf-connecting-ip") ?? "desconocida";
  const { success } = await env.VINCULACION_RATE_LIMITER.limit({ key: ip });

  if (!success) {
    return NextResponse.json(
      { error: "Demasiados intentos. Espera un momento e intenta de nuevo." },
      { status: 429 },
    );
  }

  const rawBody: unknown = await request.json().catch(() => null);
  const body = (rawBody ?? {}) as { codigo?: unknown };
  const codigo = typeof body.codigo === "string" ? body.codigo.trim().toUpperCase() : "";

  if (!codigo) {
    return NextResponse.json({ error: "Código inválido." }, { status: 400 });
  }

  const admin = getSupabaseAdminClient();

  const { data: paciente } = await admin
    .from("pacientes")
    .select("id, nombre")
    .eq("codigo_invitacion", codigo)
    .maybeSingle();

  if (!paciente) {
    return NextResponse.json({ error: "No encontramos ese código." }, { status: 404 });
  }

  const { data: asignacion } = await admin
    .from("asignaciones")
    .select("nutricionista_id")
    .eq("paciente_id", paciente.id)
    .maybeSingle();

  const { data: nutricionista } = asignacion
    ? await admin
        .from("nutricionistas")
        .select("nombre")
        .eq("id", asignacion.nutricionista_id)
        .maybeSingle()
    : { data: null };

  return NextResponse.json({
    pacienteId: paciente.id,
    pacienteNombre: paciente.nombre,
    nutricionistaNombre: nutricionista?.nombre ?? null,
  });
}
