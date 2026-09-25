"use client";

import { useState, type FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { getSupabaseBrowserClient } from "@/lib/supabase/browser";
import { IconoCheck, IconoInicio, IconoPersona } from "../../icons";
import styles from "../nutricionista.module.css";

export default function RegistroPage() {
  const router = useRouter();
  const [nombre, setNombre] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [cargando, setCargando] = useState(false);
  const [confirmarCorreo, setConfirmarCorreo] = useState(false);

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setCargando(true);

    const supabase = getSupabaseBrowserClient();
    const { data, error: signUpError } = await supabase.auth.signUp({
      email,
      password,
      options: { data: { nombre } },
    });

    setCargando(false);

    if (signUpError) {
      setError(traducirError(signUpError.message));
      return;
    }

    if (data.session) {
      router.push("/nutricionista");
      router.refresh();
      return;
    }

    setConfirmarCorreo(true);
  }

  if (confirmarCorreo) {
    return (
      <div className={styles.pagina}>
        <div className={styles.headerHome}>
          <Link href="/" className={styles.linkInicio} aria-label="Ir al inicio">
            <IconoInicio size={20} />
          </Link>
        </div>
        <div className={styles.badge} aria-hidden="true">
          <IconoCheck size={30} />
        </div>
        <h1 className={styles.titulo}>¡Listo! Revisa tu correo</h1>
        <p className={styles.subtitulo}>
          Te enviamos un link de confirmación a <strong>{email}</strong>. Ábrelo para
          activar tu cuenta.
        </p>
        <Link href="/nutricionista/ingresar" className={styles.enlace}>
          ‹ Volver a ingresar
        </Link>
      </div>
    );
  }

  return (
    <div className={styles.pagina}>
      <div className={styles.headerHome}>
        <Link href="/" className={styles.linkInicio} aria-label="Ir al inicio">
          <IconoInicio size={20} />
        </Link>
      </div>
      <div className={styles.badge} aria-hidden="true">
        <IconoPersona size={30} />
      </div>
      <h1 className={styles.titulo}>Crea tu cuenta</h1>
      <p className={styles.subtitulo}>Regístrate para definir las reglas de tus pacientes.</p>

      <form className={styles.formulario} onSubmit={handleSubmit}>
        <div className={styles.campo}>
          <label className={styles.etiqueta} htmlFor="nombre">
            Nombre completo
          </label>
          <input
            id="nombre"
            className={styles.input}
            type="text"
            required
            value={nombre}
            onChange={(e) => setNombre(e.target.value)}
            autoComplete="name"
          />
        </div>

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
            minLength={6}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="new-password"
          />
        </div>

        {error && <p className={styles.error}>{error}</p>}

        <button type="submit" className={styles.botonPrimario} disabled={cargando}>
          {cargando ? "Creando cuenta…" : "Crear cuenta"}
        </button>
      </form>

      <p className={styles.piePagina}>
        ¿Ya tienes cuenta?{" "}
        <Link href="/nutricionista/ingresar" className={styles.enlace}>
          Ingresa
        </Link>
      </p>
    </div>
  );
}

function traducirError(mensaje: string): string {
  if (mensaje.includes("already registered")) return "Ese correo ya tiene una cuenta.";
  if (mensaje.includes("Password should be")) {
    return "La contraseña debe tener al menos 6 caracteres.";
  }
  if (mensaje.includes("valid email")) return "Ingresa un correo válido.";
  return "No pudimos crear tu cuenta. Intenta de nuevo.";
}
