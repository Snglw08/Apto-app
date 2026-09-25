"use client";

import { useState } from "react";
import { getSupabaseBrowserClient } from "@/lib/supabase/browser";
import styles from "../../nutricionista.module.css";

type Tipo = "vetado" | "recomendado";

type Regla = {
  id: string;
  tipo: Tipo;
  ingrediente_clave: string;
};

export default function ReglasPanel({
  pacienteId,
  reglasIniciales,
}: {
  pacienteId: string;
  reglasIniciales: Regla[];
}) {
  const [reglas, setReglas] = useState<Regla[]>(reglasIniciales);
  const [ingrediente, setIngrediente] = useState("");
  const [tipoNuevo, setTipoNuevo] = useState<Tipo>("vetado");
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function agregarRegla() {
    const clave = ingrediente.trim();
    if (!clave) return;

    setCargando(true);
    setError(null);

    const supabase = getSupabaseBrowserClient();
    const { data, error: insertError } = await supabase
      .from("reglas")
      .insert({ paciente_id: pacienteId, tipo: tipoNuevo, ingrediente_clave: clave })
      .select("id, tipo, ingrediente_clave")
      .single();

    setCargando(false);

    if (insertError || !data) {
      setError("No pudimos agregar la restricción.");
      return;
    }

    setReglas((actual) => [...actual, data as Regla]);
    setIngrediente("");
  }

  async function cambiarTipo(regla: Regla, tipo: Tipo) {
    if (regla.tipo === tipo) return;

    setReglas((actual) => actual.map((r) => (r.id === regla.id ? { ...r, tipo } : r)));

    const supabase = getSupabaseBrowserClient();
    const { error: updateError } = await supabase
      .from("reglas")
      .update({ tipo })
      .eq("id", regla.id);

    if (updateError) {
      // Revierte si falló en el servidor.
      setReglas((actual) => actual.map((r) => (r.id === regla.id ? { ...r, tipo: regla.tipo } : r)));
      setError("No pudimos actualizar la restricción.");
    }
  }

  async function eliminarRegla(id: string) {
    const anterior = reglas;
    setReglas((actual) => actual.filter((r) => r.id !== id));

    const supabase = getSupabaseBrowserClient();
    const { error: deleteError } = await supabase.from("reglas").delete().eq("id", id);

    if (deleteError) {
      setReglas(anterior);
      setError("No pudimos eliminar la restricción.");
    }
  }

  return (
    <div className={styles.restriccionesCard}>
      <p className={styles.eyebrowTitulo}>Restricciones</p>

      {reglas.length === 0 && (
        <p className={styles.vacio} style={{ padding: "8px 0" }}>
          Todavía no agregaste restricciones para este paciente.
        </p>
      )}

      {reglas.map((regla) => (
        <div key={regla.id} className={styles.reglaFila}>
          <span className={styles.reglaTexto}>{regla.ingrediente_clave}</span>
          <TipoToggle valor={regla.tipo} onCambiar={(tipo) => cambiarTipo(regla, tipo)} />
          <button
            type="button"
            className={styles.botonEliminar}
            onClick={() => eliminarRegla(regla.id)}
            aria-label={`Eliminar restricción ${regla.ingrediente_clave}`}
          >
            ✕
          </button>
        </div>
      ))}

      {error && <p className={styles.error}>{error}</p>}

      <div className={styles.nuevaReglaForm}>
        <input
          className={styles.input}
          type="text"
          placeholder="Ingrediente clave (ej. jarabe de maíz)"
          value={ingrediente}
          onChange={(e) => setIngrediente(e.target.value)}
        />
        <div className={styles.nuevaReglaFila}>
          <TipoToggle valor={tipoNuevo} onCambiar={setTipoNuevo} />
          <button
            type="button"
            className={styles.botonAgregar}
            onClick={agregarRegla}
            disabled={cargando || !ingrediente.trim()}
          >
            {cargando ? "Agregando…" : "Agregar"}
          </button>
        </div>
      </div>
    </div>
  );
}

function TipoToggle({ valor, onCambiar }: { valor: Tipo; onCambiar: (tipo: Tipo) => void }) {
  return (
    <div className={styles.tipoToggle} role="group" aria-label="Tipo de restricción">
      <button
        type="button"
        className={`${styles.tipoToggleOpcion} ${
          valor === "vetado" ? styles.tipoToggleOpcionActiva : ""
        }`}
        onClick={() => onCambiar("vetado")}
      >
        No recomendado
      </button>
      <button
        type="button"
        className={`${styles.tipoToggleOpcion} ${
          valor === "recomendado" ? styles.tipoToggleOpcionActiva : ""
        }`}
        onClick={() => onCambiar("recomendado")}
      >
        Recomendado
      </button>
    </div>
  );
}
