import { redirect } from "next/navigation";
import Link from "next/link";
import { getSupabaseServerClient } from "@/lib/supabase/server-auth";
import { IconoInicio } from "../../icons";
import styles from "../nutricionista.module.css";

export default async function PacientesPage() {
  const supabase = await getSupabaseServerClient();
  const { data: claims, error } = await supabase.auth.getClaims();

  if (error || !claims?.claims) {
    redirect("/nutricionista/ingresar");
  }

  // RLS filtra automáticamente a los pacientes asignados a este nutricionista.
  const { data: pacientes } = await supabase
    .from("pacientes")
    .select("id, nombre, diagnostico")
    .order("nombre");

  return (
    <div className={styles.paginaLista}>
      <div className={styles.encabezado}>
        <div className={styles.encabezadoFila}>
          <Link href="/nutricionista" className={styles.enlace}>
            ‹ Cuenta
          </Link>
          <Link href="/" className={styles.linkInicio} aria-label="Ir al inicio">
            <IconoInicio size={20} />
          </Link>
        </div>
        <p className={styles.eyebrowTitulo}>Panel</p>
        <h1 className={styles.tituloGrande}>Tus pacientes</h1>
      </div>

      <Link href="/nutricionista/pacientes/nuevo" className={styles.botonPrimario}>
        + Nuevo paciente
      </Link>

      {pacientes && pacientes.length > 0 ? (
        pacientes.map((paciente) => (
          <Link
            key={paciente.id}
            href={`/nutricionista/pacientes/${paciente.id}`}
            className={styles.pacienteCard}
          >
            <div className={styles.pacienteInfo}>
              <span className={styles.pacienteNombre}>{paciente.nombre}</span>
              {paciente.diagnostico && (
                <span className={styles.pacienteDiagnostico}>{paciente.diagnostico}</span>
              )}
            </div>
            <span className={styles.pacienteFlecha} aria-hidden="true">
              ›
            </span>
          </Link>
        ))
      ) : (
        <p className={styles.vacio}>Todavía no tienes pacientes. Agrega el primero. ✨</p>
      )}
    </div>
  );
}
