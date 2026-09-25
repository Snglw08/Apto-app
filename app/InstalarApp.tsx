"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { IconoCompartir, IconoInstalar } from "./icons";
import styles from "./InstalarApp.module.css";

const CLAVE_DESCARTADO = "apto-instalar-descartado";
const DIAS_ANTES_DE_REINSISTIR = 14;

// No es un tipo estándar del DOM: beforeinstallprompt solo lo implementan
// navegadores basados en Chromium (Safari/iOS no lo tiene en absoluto).
type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed"; platform: string }>;
};

function yaInstalada(): boolean {
  if (window.matchMedia("(display-mode: standalone)").matches) return true;
  // navigator.standalone es específico de Safari/iOS, no está en el tipo estándar.
  const nav = window.navigator as Navigator & { standalone?: boolean };
  return nav.standalone === true;
}

function descartadoRecientemente(): boolean {
  const guardado = localStorage.getItem(CLAVE_DESCARTADO);
  if (!guardado) return false;
  const dias = (Date.now() - Number(guardado)) / (1000 * 60 * 60 * 24);
  return dias < DIAS_ANTES_DE_REINSISTIR;
}

function descartar() {
  localStorage.setItem(CLAVE_DESCARTADO, String(Date.now()));
}

export default function InstalarApp() {
  const pathname = usePathname();
  const [plataforma, setPlataforma] = useState<"android" | "ios" | null>(null);
  const [promptEvento, setPromptEvento] = useState<BeforeInstallPromptEvent | null>(null);

  useEffect(() => {
    if (yaInstalada() || descartadoRecientemente()) return;

    const esIOS = /iphone|ipad|ipod/i.test(window.navigator.userAgent);
    if (esIOS) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setPlataforma("ios");
      return;
    }

    // Android/Chrome: no hay nada que mostrar hasta que el navegador avise
    // que la app es instalable.
    function alPoderInstalar(evento: Event) {
      evento.preventDefault();
      setPromptEvento(evento as BeforeInstallPromptEvent);
      setPlataforma("android");
    }

    function alInstalar() {
      setPlataforma(null);
      setPromptEvento(null);
    }

    window.addEventListener("beforeinstallprompt", alPoderInstalar);
    window.addEventListener("appinstalled", alInstalar);
    return () => {
      window.removeEventListener("beforeinstallprompt", alPoderInstalar);
      window.removeEventListener("appinstalled", alInstalar);
    };
  }, []);

  async function instalarAndroid() {
    if (!promptEvento) return;
    await promptEvento.prompt();
    await promptEvento.userChoice;
    // Se acepte o no, no tiene sentido volver a ofrecer el mismo prompt ya usado.
    descartar();
    setPlataforma(null);
    setPromptEvento(null);
  }

  function cerrar() {
    descartar();
    setPlataforma(null);
  }

  // La pantalla de escaneo es a pantalla completa (cámara); un banner fijo
  // abajo taparía el marco guía o el botón de cerrar.
  if (!plataforma || pathname === "/escanear") return null;

  return (
    <div className={styles.banner} role="dialog" aria-label="Instalar Apto">
      <button type="button" className={styles.cerrar} onClick={cerrar} aria-label="Cerrar">
        ✕
      </button>

      {plataforma === "android" ? (
        <>
          <div className={styles.icono} aria-hidden="true">
            <IconoInstalar size={22} />
          </div>
          <div className={styles.texto}>
            <p className={styles.titulo}>Instala Apto</p>
            <p className={styles.subtitulo}>Accede más rápido, sin pasar por el navegador.</p>
          </div>
          <button type="button" className={styles.botonInstalar} onClick={instalarAndroid}>
            Instalar
          </button>
        </>
      ) : (
        <>
          <div className={styles.icono} aria-hidden="true">
            <IconoCompartir size={22} />
          </div>
          <div className={styles.texto}>
            <p className={styles.titulo}>Instala Apto</p>
            <p className={styles.subtitulo}>
              Toca el botón <strong>Compartir</strong> de Safari y elige{" "}
              <strong>«Agregar a inicio»</strong>.
            </p>
          </div>
        </>
      )}
    </div>
  );
}
