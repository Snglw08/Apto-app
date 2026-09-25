import { NextResponse } from "next/server";
import { getSupabaseAdminClient } from "@/lib/supabase/server";

// Ruta pública (sin sesión): el paciente consulta sus propias reglas por su
// pacienteId, un UUID que recibió tras una vinculación válida y guarda en su
// localStorage. A diferencia del código de invitación (4 caracteres,
// enumerable, ver /api/vinculacion), un UUID no es adivinable por fuerza
// bruta, así que no hace falta rate limiting acá. Devuelve solo lo mínimo
// (tipo + ingrediente_clave), nunca datos del paciente.
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const admin = getSupabaseAdminClient();

  const { data: reglas, error } = await admin
    .from("reglas")
    .select("tipo, ingrediente_clave")
    .eq("paciente_id", id);

  if (error) {
    return NextResponse.json({ error: "No pudimos cargar las reglas." }, { status: 500 });
  }

  return NextResponse.json({ reglas: reglas ?? [] });
}
