import { NextResponse } from "next/server";
import { getSupabaseServerClient } from "@/lib/supabase/server-auth";

// Excluye 0/O, 1/I/L (se confunden fácil al compartir el código de palabra).
const ALFABETO = "23456789ABCDEFGHJKMNPQRSTUVWXYZ";

function generarCodigo(): string {
  let codigo = "";
  for (let i = 0; i < 4; i++) {
    codigo += ALFABETO[Math.floor(Math.random() * ALFABETO.length)];
  }
  return codigo;
}

export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await getSupabaseServerClient();
  const { data: claims, error: authError } = await supabase.auth.getClaims();

  if (authError || !claims?.claims) {
    return NextResponse.json({ error: "No autenticado." }, { status: 401 });
  }

  // La policy de UPDATE de pacientes (RLS) garantiza que esto solo afecte a
  // un paciente propio: si no es dueño, la fila simplemente no se actualiza.
  for (let intento = 0; intento < 5; intento++) {
    const codigo = generarCodigo();
    const { data, error } = await supabase
      .from("pacientes")
      .update({ codigo_invitacion: codigo })
      .eq("id", id)
      .select("codigo_invitacion")
      .maybeSingle();

    if (!error && data) {
      return NextResponse.json({ codigo: data.codigo_invitacion });
    }

    if (!error && !data) {
      return NextResponse.json({ error: "No encontramos ese paciente." }, { status: 404 });
    }

    // 23505 = unique_violation (código repetido): reintenta con uno nuevo.
    if (error && error.code !== "23505") {
      return NextResponse.json({ error: "No pudimos generar el código." }, { status: 500 });
    }
  }

  return NextResponse.json(
    { error: "No pudimos generar un código único. Intenta de nuevo." },
    { status: 500 },
  );
}
