import { NextResponse } from "next/server";
import { getSupabaseAdminClient } from "@/lib/supabase/server";

// Ruta pública (sin sesión): el paciente consulta sus propias reglas por su
// pacienteId, un UUID que recibió tras una vinculación válida y guarda en su
// localStorage. A diferencia del código de invitación (4 caracteres,
// enumerable, ver /api/vinculacion), un UUID no es adivinable por fuerza
// bruta, así que no hace falta rate limiting acá. Devuelve solo lo mínimo
// (tipo + ingrediente_clave), nunca datos del paciente.
//
// Los cuatro códigos de respuesta son deliberados, y la diferencia importa
// aguas arriba: quien consume esto tiene que poder distinguir "este paciente
// no tiene reglas" de "no pudimos averiguar si las tiene". Si las dos cosas
// llegan como una lista vacía, el semáforo calcula un veredicto con cero
// reglas y muestra NEUTRO ("con moderación, sin problema") cuando en realidad
// no sabe nada — justo lo contrario de fallar hacia el lado seguro (ver la
// regla del semáforo en el README).
//
//   400 → el id no tiene forma de UUID (no se toca la base)
//   404 → el paciente no existe
//   500 → la consulta falló
//   200 → { reglas: [...] }, y una lista vacía acá SÍ significa "sin reglas"
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type PacienteConReglas = {
  id: string;
  reglas: { tipo: "vetado" | "recomendado"; ingrediente_clave: string }[];
};

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  // Sin esto, un id con cualquier otra forma llega a Postgres, falla al castear
  // a uuid (22P02) y sale como 500 — un error del servidor para lo que en
  // realidad es un pedido mal formado.
  if (!UUID.test(id)) {
    return NextResponse.json({ error: "Identificador de paciente inválido." }, { status: 400 });
  }

  const admin = getSupabaseAdminClient();

  // Una sola ida y vuelta: se pide el paciente con sus reglas embebidas
  // (PostgREST resuelve el embed por la foreign key reglas.paciente_id). Así
  // el "no existe" y el "existe sin reglas" quedan separados por estructura y
  // no por el orden de dos consultas: paciente null es 404, reglas [] es 200.
  const { data, error } = await admin
    .from("pacientes")
    .select("id, reglas(tipo, ingrediente_clave)")
    .eq("id", id)
    .maybeSingle<PacienteConReglas>();

  if (error) {
    return NextResponse.json({ error: "No pudimos cargar las reglas." }, { status: 500 });
  }

  if (!data) {
    return NextResponse.json({ error: "No encontramos ese paciente." }, { status: 404 });
  }

  return NextResponse.json({ reglas: data.reglas ?? [] });
}
