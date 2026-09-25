import { NextResponse } from "next/server";
import { getSupabaseServerClient } from "@/lib/supabase/server-auth";
import { getSupabaseAdminClient } from "@/lib/supabase/server";

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id: pacienteId } = await params;

  const supabase = await getSupabaseServerClient();
  const { data: claims, error: authError } = await supabase.auth.getClaims();

  if (authError || !claims?.claims) {
    return NextResponse.json({ error: "No autenticado." }, { status: 401 });
  }

  const { data: nutricionista, error: nutriError } = await supabase
    .from("nutricionistas")
    .select("id")
    .eq("user_id", claims.claims.sub)
    .maybeSingle();

  if (nutriError || !nutricionista) {
    return NextResponse.json(
      { error: "No encontramos tu perfil de nutricionista." },
      { status: 404 },
    );
  }

  // service_role bypasea RLS: hay que verificar acá mismo que el paciente
  // está asignado a este nutricionista antes de borrar (pacientes no tiene
  // columna de dueño directa, la relación es vía asignaciones).
  const admin = getSupabaseAdminClient();
  const { data: asignacion, error: asignacionError } = await admin
    .from("asignaciones")
    .select("id")
    .eq("nutricionista_id", nutricionista.id)
    .eq("paciente_id", pacienteId)
    .maybeSingle();

  if (asignacionError || !asignacion) {
    return NextResponse.json(
      { error: "Ese paciente no está asignado a tu cuenta." },
      { status: 404 },
    );
  }

  // on delete cascade en asignaciones.paciente_id y reglas.paciente_id se
  // encarga de limpiar la asignación y las reglas del paciente.
  const { error: deleteError } = await admin.from("pacientes").delete().eq("id", pacienteId);

  if (deleteError) {
    return NextResponse.json({ error: "No pudimos eliminar el paciente." }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
