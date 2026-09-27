import { redirect } from "next/navigation";
import Link from "next/link";
import { getSupabaseServerClient } from "@/lib/supabase/server-auth";
import ReglasPanel from "./ReglasPanel";
import CodigoInvitacion from "./CodigoInvitacion";
import EliminarPaciente from "./EliminarPaciente";
import { IconoInicio } from "../../../icons";
import styles from "../../nutricionista.module.css";

export default async function PacienteDetallePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await getSupabaseServerClient();
  const { data: claims, error } = await supabase.auth.getClaims();

  if (error || !claims?.claims) {
    redirect("/nutricionista/ingresar");
  }

  // RLS garantiza que solo se pueda leer si el paciente está asignado a este
  // nutricionista; si no, paciente queda null (no filtramos por dueño acá).
  const { data: paciente } = await supabase
    .from("pacientes")
    .select("id, nombre, diagnostico, codigo_invitacion")
    .eq("id", id)
    .maybeSingle();

  if (!paciente) {
    return (
      <div className={styles.paginaLista}>
        <div className={styles.encabezado}>
          <div className={styles.encabezadoFila}>
            <Link href="/nutricionista/pacientes" className={styles.enlace}>
              ‹ Pacientes
            </Link>
            <Link href="/" className={styles.linkInicio} aria-label="Ir al inicio">
              <IconoInicio size={20} />
            </Link>
          </div>
        </div>
        <p className={styles.vacio}>No encontramos ese paciente.</p>
      </div>
    );
  }

  // El error se mira, no se descarta: si la consulta falla y se cae a una lista
  // vacía, el panel le muestra al nutricionista un plan vacío para un paciente
  // que sí tiene reglas, y podría volver a cargarlas duplicadas. Mismo criterio
  // que en /perfil y en el semáforo: "no tiene" y "no pudimos consultar" son
  // dos mensajes distintos.
  const { data: reglas, error: reglasError } = await supabase
    .from("reglas")
    .select("id, tipo, ingrediente_clave")
    .eq("paciente_id", paciente.id)
    .order("created_at");

  return (
    <div className={styles.paginaLista}>
      <div className={styles.encabezado}>
        <div className={styles.encabezadoFila}>
          <Link href="/nutricionista/pacientes" className={styles.enlace}>
            ‹ Pacientes
          </Link>
          <Link href="/" className={styles.linkInicio} aria-label="Ir al inicio">
            <IconoInicio size={20} />
          </Link>
        </div>
        <p className={styles.eyebrowTitulo}>Paciente</p>
        <h1 className={styles.tituloGrande}>{paciente.nombre}</h1>
        {paciente.diagnostico && (
          <p className={styles.subtitulo} style={{ margin: 0, textAlign: "left" }}>
            {paciente.diagnostico}
          </p>
        )}
      </div>

      {reglasError ? (
        <p className={styles.avisoError}>
          No pudimos cargar las reglas de este paciente. Esto no significa que no tenga
          ninguna: recarga la página para volver a intentar.
        </p>
      ) : (
        <ReglasPanel pacienteId={paciente.id} reglasIniciales={reglas ?? []} />
      )}

      <CodigoInvitacion
        pacienteId={paciente.id}
        pacienteNombre={paciente.nombre}
        codigoInicial={paciente.codigo_invitacion}
      />

      <EliminarPaciente pacienteId={paciente.id} pacienteNombre={paciente.nombre} />
    </div>
  );
}
