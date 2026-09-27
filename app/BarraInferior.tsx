"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useIrAEscanear } from "./escanear/ir-a-escanear";
import { IconoEscanear, IconoInicio, IconoPersona } from "./icons";
import styles from "./BarraInferior.module.css";

/**
 * Navegación del circuito del paciente. Tres pestañas: inicio, escanear y
 * perfil.
 *
 * Existe por una razón concreta además de la estética: antes cada pantalla
 * resolvía el "volver" por su cuenta, y habían quedado cuatro botones de inicio
 * con aspectos distintos — con sombra y sin, con fondo de tarjeta y de app, y
 * uno llamado botonAtras. Un solo componente los reemplaza a todos.
 */

/**
 * Dónde NO va.
 *
 * - `/escanear` es pantalla completa de cámara: cualquier cosa encima le roba
 *   área al visor y compite con la píldora de escaneo.
 * - `/nutricionista/*` es otro rol, no otra sección de la misma app. Esas
 *   pantallas tienen su propia navegación y comparten un solo estilo entre sí.
 * - `/admin/*` es el tablero interno, deliberadamente aislado del resto (no
 *   importa estilos de otras rutas ni se enlaza desde ninguna pantalla).
 */
const OCULTA_EN = [/^\/escanear/, /^\/nutricionista/, /^\/admin/];

type Pestana = "inicio" | "escanear" | "perfil";

/**
 * Qué pestaña se marca activa en cada ruta. `/producto` cuenta como escanear
 * porque se llega ahí escaneando, y `/vinculacion` como perfil porque vincularse
 * es administrar la propia cuenta.
 */
function pestanaActiva(ruta: string): Pestana | null {
  if (ruta === "/") return "inicio";
  if (ruta.startsWith("/escanear") || ruta.startsWith("/producto")) return "escanear";
  if (ruta.startsWith("/perfil") || ruta.startsWith("/vinculacion")) return "perfil";
  return null;
}

export default function BarraInferior() {
  const ruta = usePathname();
  const irAEscanear = useIrAEscanear();

  if (OCULTA_EN.some((patron) => patron.test(ruta))) return null;

  const activa = pestanaActiva(ruta);

  return (
    <nav className={styles.barra} aria-label="Navegación principal">
      <Link
        href="/"
        className={`${styles.pestana} ${activa === "inicio" ? styles.activa : ""}`}
        aria-current={activa === "inicio" ? "page" : undefined}
      >
        <IconoInicio size={23} />
        <span className={styles.etiqueta}>Inicio</span>
      </Link>

      {/* El escaneo sale de la fila: es la acción central de la app y la única
          que el usuario viene a hacer. El borde blanco lo recorta del fondo de
          la barra cuando el círculo la desborda hacia arriba. */}
      <Link href="/escanear" onClick={irAEscanear} className={styles.pestanaEscanear}>
        <span className={styles.circuloEscanear} aria-hidden="true">
          <IconoEscanear size={27} />
        </span>
        <span className={styles.etiquetaEscanear}>Escanear</span>
      </Link>

      <Link
        href="/perfil"
        className={`${styles.pestana} ${activa === "perfil" ? styles.activa : ""}`}
        aria-current={activa === "perfil" ? "page" : undefined}
      >
        <IconoPersona size={23} />
        <span className={styles.etiqueta}>Perfil</span>
      </Link>
    </nav>
  );
}
