"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { IconoCheck, IconoEnlace, IconoNotas, IconoPersona, IconoX } from "../icons";
import styles from "./page.module.css";

const STORAGE_KEY = "apto-vinculacion";

type Vinculo = {
  pacienteId: string;
  pacienteNombre: string;
  nutricionistaNombre: string | null;
};

type Regla = { tipo: "vetado" | "recomendado"; ingrediente_clave: string };

export default function PerfilPage() {
  const router = useRouter();
  // undefined = todavía no se revisó localStorage; null = no vinculado.
  const [vinculo, setVinculo] = useState<Vinculo | null | undefined>(undefined);
  const [reglas, setReglas] = useState<Regla[] | null>(null);

  useEffect(() => {
    // localStorage no existe durante el render en el servidor; no hay forma
    // de derivar esto en el render, tiene que leerse en un efecto.
    const guardado = localStorage.getItem(STORAGE_KEY);
    if (!guardado) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setVinculo(null);
      return;
    }

    let parseado: Vinculo;
    try {
      parseado = JSON.parse(guardado) as Vinculo;
    } catch {
      setVinculo(null);
      return;
    }

    setVinculo(parseado);

    // Misma ruta pública que usa el semáforo (app/producto/[codigo_barras]).
    fetch(`/api/pacientes/${encodeURIComponent(parseado.pacienteId)}/reglas`)
      .then((res): Promise<unknown> => (res.ok ? res.json() : Promise.resolve({ reglas: [] })))
      .then((data) => {
        const { reglas: recibidas } = data as { reglas: Regla[] };
        setReglas(recibidas ?? []);
      })
      .catch(() => setReglas([]));
  }, []);

  function desvincular() {
    localStorage.removeItem(STORAGE_KEY);
    router.push("/");
  }

  const encabezado = (
    <header className={styles.encabezado}>
      <Link href="/" className={styles.botonAtras} aria-label="Volver">
        ‹
      </Link>
      <h1 className={styles.tituloPagina}>Mi perfil</h1>
    </header>
  );

  if (vinculo === null) {
    return (
      <div className={styles.pagina}>
        {encabezado}

        <div className={styles.tarjetaIdentidadBlanca}>
          <div className={styles.avatarPlaceholder} aria-hidden="true">
            <IconoPersona size={26} />
          </div>
          <div>
            <p className={styles.nombrePaciente}>Todavía no te has vinculado</p>
            <span className={styles.pillSinNutri}>Sin nutricionista</span>
          </div>
        </div>

        <div className={styles.centroSinVincular}>
          <div className={styles.badgeVinculo} aria-hidden="true">
            <IconoEnlace size={28} />
          </div>
          <h2 className={styles.tituloCentro}>Conecta con tu nutricionista</h2>
          <p className={styles.textoCentro}>
            Tu guía de ingredientes a evitar y preferir la define un profesional, no un
            algoritmo. Conéctate para recibir tu plan personalizado.
          </p>
        </div>

        <Link href="/vinculacion" className={styles.botonPrimario}>
          Conectar con mi nutricionista
        </Link>
        <Link href="/vinculacion" className={styles.enlaceCodigo}>
          Tengo un código de invitación
        </Link>
      </div>
    );
  }

  if (vinculo === undefined || reglas === null) {
    return (
      <div className={styles.pagina}>
        {encabezado}
        <p className={styles.cargando}>Cargando…</p>
      </div>
    );
  }

  const vetados = reglas.filter((r) => r.tipo === "vetado");
  const recomendados = reglas.filter((r) => r.tipo === "recomendado");
  const inicial = vinculo.pacienteNombre.charAt(0).toUpperCase();
  const nombreNutri = vinculo.nutricionistaNombre ?? "tu nutricionista";

  return (
    <div className={styles.pagina}>
      {encabezado}

      <div className={styles.tarjetaIdentidad}>
        <div className={styles.avatarPaciente} aria-hidden="true">
          {inicial}
        </div>
        <div>
          <p className={styles.nombrePacienteVioleta}>{vinculo.pacienteNombre}</p>
          <p className={styles.definidoPor}>
            Tu plan lo definió <strong>{nombreNutri}</strong>
          </p>
        </div>
      </div>

      {reglas.length === 0 ? (
        <div className={styles.estadoVacio}>
          <div className={styles.badgeVacio} aria-hidden="true">
            <IconoNotas size={26} />
          </div>
          <h2 className={styles.tituloVacio}>Tu plan está en camino</h2>
          <p className={styles.textoVacio}>
            {nombreNutri} aún no ha definido tus ingredientes a evitar y preferir. Te
            avisaremos apenas estén listos 💜
          </p>
          <div className={styles.contadoresVacio}>
            <span className={styles.pillVacioEvitar}>Evitar · 0</span>
            <span className={styles.pillVacioPreferir}>Preferir · 0</span>
          </div>
        </div>
      ) : (
        <>
          <div className={styles.tarjetaLista}>
            <div className={styles.encabezadoLista}>
              <div className={`${styles.badgeLista} ${styles.badgeEvitar}`} aria-hidden="true">
                <IconoX size={16} />
              </div>
              <h2 className={styles.tituloLista}>Evitar</h2>
              <span className={`${styles.contador} ${styles.contadorEvitar}`}>
                {vetados.length}
              </span>
            </div>
            {vetados.length > 0 ? (
              vetados.map((r) => (
                <div
                  key={r.ingrediente_clave}
                  className={`${styles.filaIngrediente} ${styles.filaEvitar}`}
                >
                  {r.ingrediente_clave}
                </div>
              ))
            ) : (
              <p className={styles.filaVaciaTexto}>Sin ingredientes vetados todavía.</p>
            )}
          </div>

          <div className={styles.tarjetaLista}>
            <div className={styles.encabezadoLista}>
              <div className={`${styles.badgeLista} ${styles.badgePreferir}`} aria-hidden="true">
                <IconoCheck size={16} />
              </div>
              <h2 className={styles.tituloLista}>Preferir</h2>
              <span className={`${styles.contador} ${styles.contadorPreferir}`}>
                {recomendados.length}
              </span>
            </div>
            {recomendados.length > 0 ? (
              recomendados.map((r) => (
                <div
                  key={r.ingrediente_clave}
                  className={`${styles.filaIngrediente} ${styles.filaPreferir}`}
                >
                  {r.ingrediente_clave}
                </div>
              ))
            ) : (
              <p className={styles.filaVaciaTexto}>Sin ingredientes recomendados todavía.</p>
            )}
          </div>
        </>
      )}

      <button type="button" className={styles.enlaceDesvincular} onClick={desvincular}>
        Desvincular a mi nutricionista
      </button>
    </div>
  );
}
