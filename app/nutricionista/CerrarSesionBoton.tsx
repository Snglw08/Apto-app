"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { getSupabaseBrowserClient } from "@/lib/supabase/browser";
import styles from "./nutricionista.module.css";

export default function CerrarSesionBoton() {
  const router = useRouter();
  const [cargando, setCargando] = useState(false);

  async function handleClick() {
    setCargando(true);
    const supabase = getSupabaseBrowserClient();
    await supabase.auth.signOut();
    router.push("/nutricionista/ingresar");
    router.refresh();
  }

  return (
    <button
      type="button"
      className={styles.botonSecundario}
      onClick={handleClick}
      disabled={cargando}
    >
      {cargando ? "Cerrando sesión…" : "Cerrar sesión"}
    </button>
  );
}
