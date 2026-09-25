"use client";

import { useState } from "react";
import styles from "../../nutricionista.module.css";

export default function CodigoInvitacion({
  pacienteId,
  pacienteNombre,
  codigoInicial,
}: {
  pacienteId: string;
  pacienteNombre: string;
  codigoInicial: string | null;
}) {
  const [codigo, setCodigo] = useState(codigoInicial);
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copiado, setCopiado] = useState(false);

  async function generar() {
    setCargando(true);
    setError(null);
    setCopiado(false);

    const res = await fetch(`/api/nutricionista/pacientes/${pacienteId}/codigo`, {
      method: "POST",
    });
    const data = (await res.json().catch(() => null)) as
      | { codigo: string }
      | { error: string }
      | null;

    setCargando(false);

    if (!res.ok || !data || "error" in data) {
      setError(data && "error" in data ? data.error : "No pudimos generar el código.");
      return;
    }

    setCodigo(data.codigo);
  }

  async function compartir() {
    if (!codigo) return;
    const texto = `Tu código para conectarte conmigo en Apto: AP-${codigo}`;

    if (navigator.share) {
      try {
        await navigator.share({ text: texto });
      } catch {
        // El usuario canceló el share; no es un error a mostrar.
      }
      return;
    }

    try {
      await navigator.clipboard.writeText(texto);
      setCopiado(true);
      setTimeout(() => setCopiado(false), 2000);
    } catch {
      setError("No pudimos copiar el código.");
    }
  }

  return (
    <div className={styles.invitacionTarjeta}>
      <p className={styles.invitacionEyebrow}>Código de invitación</p>

      {codigo ? (
        <p className={styles.invitacionCodigo}>AP-{codigo}</p>
      ) : (
        <p className={styles.invitacionVacio}>
          Genera un código para que {pacienteNombre.split(" ")[0]} se conecte contigo.
        </p>
      )}

      {error && <p className={styles.error}>{error}</p>}

      <div className={styles.invitacionBotones}>
        {codigo && (
          <button
            type="button"
            className={styles.invitacionBotonCompartir}
            onClick={compartir}
          >
            {copiado ? "¡Copiado!" : "Compartir"}
          </button>
        )}
        <button
          type="button"
          className={styles.invitacionBotonGenerar}
          onClick={generar}
          disabled={cargando}
        >
          {cargando ? "Generando…" : codigo ? "Generar nuevo" : "Generar código"}
        </button>
      </div>
    </div>
  );
}
