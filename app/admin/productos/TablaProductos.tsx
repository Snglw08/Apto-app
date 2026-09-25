"use client";

import { useMemo, useState } from "react";
import styles from "./page.module.css";

type Producto = {
  codigo_barras: string;
  nombre: string | null;
  marca: string | null;
  fuente: string;
  fecha_dato: string;
};

function formatearFecha(iso: string): string {
  return new Intl.DateTimeFormat("es-CL", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(new Date(iso));
}

export default function TablaProductos({ productos }: { productos: Producto[] }) {
  const [busqueda, setBusqueda] = useState("");

  const filtrados = useMemo(() => {
    const q = busqueda.trim().toLowerCase();
    if (!q) return productos;
    return productos.filter(
      (p) =>
        (p.nombre ?? "").toLowerCase().includes(q) ||
        (p.marca ?? "").toLowerCase().includes(q) ||
        p.codigo_barras.includes(q),
    );
  }, [productos, busqueda]);

  return (
    <>
      <input
        className={styles.buscador}
        type="text"
        placeholder="Buscar por nombre, marca o código de barras…"
        value={busqueda}
        onChange={(e) => setBusqueda(e.target.value)}
        autoComplete="off"
      />

      <div className={styles.tablaEnvoltorio}>
        <table className={styles.tabla}>
          <thead>
            <tr>
              <th>Producto</th>
              <th>Código de barras</th>
              <th>Fuente</th>
              <th>Cargado</th>
            </tr>
          </thead>
          <tbody>
            {filtrados.length === 0 ? (
              <tr>
                <td colSpan={4} className={styles.vacio}>
                  Ningún producto calza esa búsqueda.
                </td>
              </tr>
            ) : (
              filtrados.map((p) => (
                <tr key={p.codigo_barras}>
                  <td>
                    <div className={styles.nombreProducto}>{p.nombre || "Sin nombre"}</div>
                    {p.marca && <div className={styles.marcaProducto}>{p.marca}</div>}
                  </td>
                  <td className={styles.codigo}>{p.codigo_barras}</td>
                  <td>
                    <span
                      className={`${styles.pill} ${
                        p.fuente === "manual" ? styles.pillManual : styles.pillOcr
                      }`}
                    >
                      {p.fuente === "manual" ? "Manual" : "OCR"}
                    </span>
                  </td>
                  <td className={styles.fecha}>{formatearFecha(p.fecha_dato)}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </>
  );
}
