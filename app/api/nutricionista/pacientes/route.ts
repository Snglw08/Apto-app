import { NextResponse } from "next/server";
import { getSupabaseServerClient } from "@/lib/supabase/server-auth";
import { getSupabaseAdminClient } from "@/lib/supabase/server";

export async function POST(request: Request) {
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

  const rawBody: unknown = await request.json().catch(() => null);
  const body = (rawBody ?? {}) as { nombre?: unknown; diagnostico?: unknown };
  const nombre = typeof body.nombre === "string" ? body.nombre.trim() : "";
  const diagnostico =
    typeof body.diagnostico === "string" && body.diagnostico.trim()
      ? body.diagnostico.trim()
      : null;

  if (!nombre) {
    return NextResponse.json({ error: "El nombre es obligatorio." }, { status: 400 });
  }

  // pacientes no tiene columna de dueño: la relación con el nutricionista es
  // vía asignaciones, así que esta creación en dos pasos necesita service_role.
  const admin = getSupabaseAdminClient();

  const { data: paciente, error: pacienteError } = await admin
    .from("pacientes")
    .insert({ nombre, diagnostico })
    .select()
    .single();

  if (pacienteError || !paciente) {
    return NextResponse.json({ error: "No pudimos crear el paciente." }, { status: 500 });
  }

  const { error: asignacionError } = await admin
    .from("asignaciones")
    .insert({ nutricionista_id: nutricionista.id, paciente_id: paciente.id });

  if (asignacionError) {
    // Revierte el paciente huérfano para no dejar basura sin dueño.
    await admin.from("pacientes").delete().eq("id", paciente.id);
    return NextResponse.json({ error: "No pudimos asignar el paciente." }, { status: 500 });
  }

  return NextResponse.json({ paciente }, { status: 201 });
}
