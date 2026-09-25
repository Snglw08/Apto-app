import { redirect } from "next/navigation";
import Link from "next/link";
import { getSupabaseServerClient } from "@/lib/supabase/server-auth";
import { IconoInicio, IconoPersona } from "../icons";
import CerrarSesionBoton from "./CerrarSesionBoton";
import styles from "./nutricionista.module.css";

export default async function CuentaPage() {
  const supabase = await getSupabaseServerClient();
  const { data, error } = await supabase.auth.getClaims();

  if (error || !data?.claims) {
    redirect("/nutricionista/ingresar");
  }

  const { data: nutricionista } = await supabase
    .from("nutricionistas")
    .select("nombre, email")
    .eq("user_id", data.claims.sub)
    .maybeSingle();

  return (
    <div className={styles.pagina}>
      <div className={styles.headerHome}>
        <Link href="/" className={styles.linkInicio} aria-label="Ir al inicio">
          <IconoInicio size={20} />
        </Link>
      </div>
      <div className={styles.cuentaTarjeta}>
        <div className={styles.badge} aria-hidden="true">
          <IconoPersona size={30} />
        </div>
        <p className={styles.cuentaNombre}>
          Hola, {nutricionista?.nombre || "nutricionista"} 👋
        </p>
        <p className={styles.cuentaEmail}>{nutricionista?.email ?? data.claims.email}</p>
        <Link href="/nutricionista/pacientes" className={styles.botonPrimario}>
          Ver pacientes
        </Link>
        <CerrarSesionBoton />
      </div>
    </div>
  );
}
