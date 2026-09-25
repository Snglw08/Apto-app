"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import styles from "../../nutricionista.module.css";

type Props = {
  pacienteId: string;
  pacienteNombre: string;
};

type Estado = { tipo: "idle" } | { tipo: "confirmando" } | { tipo: "eliminando" } | { tipo: "error" };

export default function EliminarPaciente({ pacienteId, pacienteNombre }: Props) {
  const router = useRouter();
  const [estado, setEstado] = useState<Estado>({ tipo: "idle" });

  async function eliminar() {
    setEstado({ tipo: "eliminando" });

    const res = await fetch(`/api/nutricionista/pacientes/${pacienteId}`, {
      method: "DELETE",
    }).catch(() => null);

    if (!res || !res.ok) {
      setEstado({ tipo: "error" });
      return;
    }

    router.push("/nutricionista/pacientes");
    router.refresh();
  }

  if (estado.tipo === "confirmando" || estado.tipo === "eliminando") {
    return (
      <div className={styles.tarjetaEliminar}>
        <p className={styles.textoEliminarConfirmar}>
          ¿Eliminar a <strong>{pacienteNombre}</strong>? Se borran también sus reglas y el
          código de invitación. No se puede deshacer.
        </p>
        <div className={styles.eliminarBotones}>
          <button
            type="button"
            className={styles.botonSecundario}
            onClick={() => setEstado({ tipo: "idle" })}
            disabled={estado.tipo === "eliminando"}
          >
            Cancelar
          </button>
          <button
            type="button"
            className={styles.botonEliminarConfirmar}
            onClick={eliminar}
            disabled={estado.tipo === "eliminando"}
          >
            {estado.tipo === "eliminando" ? "Eliminando…" : "Sí, eliminar"}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className={styles.tarjetaEliminar}>
      {estado.tipo === "error" && (
        <p className={styles.error}>No pudimos eliminar el paciente. Intenta de nuevo.</p>
      )}
      <button
        type="button"
        className={styles.enlaceEliminarPaciente}
        onClick={() => setEstado({ tipo: "confirmando" })}
      >
        Eliminar paciente
      </button>
    </div>
  );
}
