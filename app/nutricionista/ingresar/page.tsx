"use client";

import { useState, type FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { getSupabaseBrowserClient } from "@/lib/supabase/browser";
import { IconoCandado, IconoInicio } from "../../icons";
import styles from "../nutricionista.module.css";

export default function IngresarPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [cargando, setCargando] = useState(false);

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setCargando(true);

    const supabase = getSupabaseBrowserClient();
    const { error: signInError } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    setCargando(false);

    if (signInError) {
      setError("Correo o contraseña incorrectos.");
      return;
    }

    router.push("/nutricionista");
    router.refresh();
  }

  return (
    <div className={styles.pagina}>
      <div className={styles.headerHome}>
        <Link href="/" className={styles.linkInicio} aria-label="Ir al inicio">
          <IconoInicio size={20} />
        </Link>
      </div>
      <div className={styles.badge} aria-hidden="true">
        <IconoCandado size={30} />
      </div>
      <h1 className={styles.titulo}>Ingresa a tu cuenta</h1>
      <p className={styles.subtitulo}>Portal de nutricionistas Apto.</p>

      <form className={styles.formulario} onSubmit={handleSubmit}>
        <div className={styles.campo}>
          <label className={styles.etiqueta} htmlFor="email">
            Correo
          </label>
          <input
            id="email"
            className={styles.input}
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            autoComplete="email"
          />
        </div>

        <div className={styles.campo}>
          <label className={styles.etiqueta} htmlFor="password">
            Contraseña
          </label>
          <input
            id="password"
            className={styles.input}
            type="password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="current-password"
          />
        </div>

        {error && <p className={styles.error}>{error}</p>}

        <button type="submit" className={styles.botonPrimario} disabled={cargando}>
          {cargando ? "Ingresando…" : "Ingresar"}
        </button>
      </form>

      <p className={styles.piePagina}>
        ¿No tienes cuenta?{" "}
        <Link href="/nutricionista/registro" className={styles.enlace}>
          Regístrate
        </Link>
      </p>
    </div>
  );
}
