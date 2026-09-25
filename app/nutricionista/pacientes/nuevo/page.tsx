"use client";

import { useState, type FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { IconoInicio, IconoPersona } from "../../../icons";
import styles from "../../nutricionista.module.css";

export default function NuevoPacientePage() {
  const router = useRouter();
  const [nombre, setNombre] = useState("");
  const [diagnostico, setDiagnostico] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [cargando, setCargando] = useState(false);

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setCargando(true);

    const res = await fetch("/api/nutricionista/pacientes", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ nombre, diagnostico }),
    });
    const data = (await res.json().catch(() => null)) as
      | { paciente: { id: string } }
      | { error: string }
      | null;

    setCargando(false);

    if (!res.ok || !data || "error" in data) {
      setError(data && "error" in data ? data.error : "No pudimos crear el paciente.");
      return;
    }

    router.push(`/nutricionista/pacientes/${data.paciente.id}`);
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
      <h1 className={styles.titulo}>Nuevo paciente</h1>
      <p className={styles.subtitulo}>Datos de prueba — sin información real de pacientes.</p>

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
          />
        </div>

        <div className={styles.campo}>
          <label className={styles.etiqueta} htmlFor="diagnostico">
            Diagnóstico (opcional)
          </label>
          <input
            id="diagnostico"
            className={styles.input}
            type="text"
            value={diagnostico}
            onChange={(e) => setDiagnostico(e.target.value)}
            placeholder="Ej. Prediabetes"
          />
        </div>

        {error && <p className={styles.error}>{error}</p>}

        <button type="submit" className={styles.botonPrimario} disabled={cargando}>
          {cargando ? "Creando…" : "Crear paciente"}
        </button>
      </form>

      <Link href="/nutricionista/pacientes" className={styles.enlace}>
        ‹ Volver a pacientes
      </Link>
    </div>
  );
}
