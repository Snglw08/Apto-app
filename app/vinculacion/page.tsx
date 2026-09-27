"use client";

import { useEffect, useRef, useState, type KeyboardEvent } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useIrAEscanear } from "../escanear/ir-a-escanear";
import { IconoEnlace, IconoPersona } from "../icons";
import styles from "./vinculacion.module.css";

const STORAGE_KEY = "apto-vinculacion";

type Vinculo = {
  pacienteId: string;
  pacienteNombre: string;
  nutricionistaNombre: string | null;
};

type EstadoValidacion =
  | { tipo: "vacio" }
  | { tipo: "validando" }
  | { tipo: "valido"; vinculo: Vinculo }
  | { tipo: "invalido" };

export default function VinculacionPage() {
  const router = useRouter();
  const irAEscanear = useIrAEscanear();
  const [caracteres, setCaracteres] = useState(["", "", "", ""]);
  const [estado, setEstado] = useState<EstadoValidacion>({ tipo: "vacio" });
  const [vinculoActual, setVinculoActual] = useState<Vinculo | null>(null);
  const inputsRef = useRef<(HTMLInputElement | null)[]>([]);

  useEffect(() => {
    const guardado = localStorage.getItem(STORAGE_KEY);
    if (!guardado) return;
    try {
      // localStorage no existe durante el render en el servidor (la ruta es
      // estática); no hay forma de derivar esto en el render, tiene que leerse acá.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setVinculoActual(JSON.parse(guardado));
    } catch {
      // Dato corrupto en localStorage: se ignora, se pide vincular de nuevo.
    }
  }, []);

  async function validar(codigo: string) {
    setEstado({ tipo: "validando" });

    const res = await fetch("/api/vinculacion", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ codigo }),
    });

    if (!res.ok) {
      setEstado({ tipo: "invalido" });
      return;
    }

    const data = (await res.json()) as {
      pacienteId: string;
      pacienteNombre: string;
      nutricionistaNombre: string | null;
    };

    setEstado({
      tipo: "valido",
      vinculo: {
        pacienteId: data.pacienteId,
        pacienteNombre: data.pacienteNombre,
        nutricionistaNombre: data.nutricionistaNombre,
      },
    });
  }

  function actualizarCaracter(indice: number, valorCrudo: string) {
    const limpio = valorCrudo.replace(/[^a-zA-Z0-9]/g, "").toUpperCase();

    if (limpio.length > 1) {
      // Pegado de varios caracteres: distribuir desde este índice en adelante.
      const nuevos = [...caracteres];
      let cursor = indice;
      for (const char of limpio) {
        if (cursor > 3) break;
        nuevos[cursor] = char;
        cursor++;
      }
      setCaracteres(nuevos);
      inputsRef.current[Math.min(cursor, 3)]?.focus();
      if (nuevos.every((c) => c)) validar(nuevos.join(""));
      else setEstado({ tipo: "vacio" });
      return;
    }

    const nuevos = [...caracteres];
    nuevos[indice] = limpio;
    setCaracteres(nuevos);

    if (limpio && indice < 3) {
      inputsRef.current[indice + 1]?.focus();
    }

    if (nuevos.every((c) => c)) {
      validar(nuevos.join(""));
    } else {
      setEstado({ tipo: "vacio" });
    }
  }

  function manejarTecla(indice: number, evento: KeyboardEvent<HTMLInputElement>) {
    if (evento.key === "Backspace" && !caracteres[indice] && indice > 0) {
      inputsRef.current[indice - 1]?.focus();
    }
  }

  function conectar() {
    if (estado.tipo !== "valido") return;
    localStorage.setItem(STORAGE_KEY, JSON.stringify(estado.vinculo));
    router.push("/");
  }

  function vincularOtro() {
    setVinculoActual(null);
    setCaracteres(["", "", "", ""]);
    setEstado({ tipo: "vacio" });
  }

  if (vinculoActual) {
    return (
      <div className={styles.pagina}>
        <div className={styles.badge} aria-hidden="true">
          <IconoEnlace size={30} />
        </div>
        <h1 className={styles.titulo}>Ya estás conectado</h1>
        <p className={styles.subtitulo}>
          Este dispositivo está vinculado con{" "}
          <strong>{vinculoActual.nutricionistaNombre ?? "tu nutricionista"}</strong> como{" "}
          {vinculoActual.pacienteNombre}.
        </p>
        <Link href="/escanear" className={styles.botonPrimario} onClick={irAEscanear}>
          Ir a escanear
        </Link>
        <button type="button" className={styles.enlace} onClick={vincularOtro}>
          Vincular con otro código
        </button>
      </div>
    );
  }

  return (
    <div className={styles.pagina}>
      <div className={styles.badge} aria-hidden="true">
        <IconoEnlace size={30} />
      </div>
      <h1 className={styles.titulo}>Conecta con tu nutricionista</h1>
      <p className={styles.subtitulo}>
        Escribe el código que te pasaron y listo, recibes tus reglas al instante.
      </p>

      <div className={styles.codigoFila}>
        {/* Prefijo fijo del código, que el usuario no escribe. Va letra por
            letra y no como "AP" porque cada casilla es una caja del mismo
            tamaño que las editables. Ojo: escrito así, el prefijo NO es
            grepeable como cadena — por eso el barrido de datos sensibles
            tiene un chequeo aparte para estas dos líneas. */}
        <div className={`${styles.codigoBox} ${styles.codigoBoxEstatico}`}>A</div>
        <div className={`${styles.codigoBox} ${styles.codigoBoxEstatico}`}>P</div>
        {caracteres.map((valor, indice) => (
          <input
            key={indice}
            ref={(el) => {
              inputsRef.current[indice] = el;
            }}
            className={styles.codigoBoxInput}
            value={valor}
            maxLength={4}
            autoCapitalize="characters"
            autoComplete="off"
            onChange={(e) => actualizarCaracter(indice, e.target.value)}
            onKeyDown={(e) => manejarTecla(indice, e)}
          />
        ))}
      </div>

      {estado.tipo === "validando" && (
        <p className={styles.subtitulo}>Buscando tu nutricionista…</p>
      )}

      {estado.tipo === "invalido" && (
        <p className={styles.error}>Ese código no existe. Revisa que esté bien escrito.</p>
      )}

      {estado.tipo === "valido" && (
        <div className={styles.previewVinculacion}>
          <div className={styles.previewAvatar} aria-hidden="true">
            <IconoPersona size={22} />
          </div>
          <div className={styles.previewTexto}>
            <span className={styles.previewLabel}>Te conectarás con</span>
            <span className={styles.previewNombre}>
              {estado.vinculo.nutricionistaNombre ?? "tu nutricionista"}
            </span>
          </div>
        </div>
      )}

      <div className={styles.espaciador} />

      <button
        type="button"
        className={styles.botonPrimario}
        onClick={conectar}
        disabled={estado.tipo !== "valido"}
      >
        Conectar ahora
      </button>
    </div>
  );
}
