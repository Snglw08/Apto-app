"use client";

import { useEffect } from "react";

const CLAVE_YA_RECARGO = "apto-recargo-por-chunk";

function esErrorDeChunkDesactualizado(valor: unknown): boolean {
  if (!(valor instanceof Error)) return false;
  return (
    valor.name === "ChunkLoadError" ||
    /Loading chunk [\w.-]+ failed/i.test(valor.message) ||
    /Failed to fetch dynamically imported module/i.test(valor.message)
  );
}

/**
 * Cada deploy a Cloudflare reemplaza los archivos del deploy anterior. Si el
 * teléfono tiene la app cargada de una versión vieja y navega después de un
 * deploy nuevo, pide chunks que ya no existen y la navegación falla ("This
 * page couldn't load"). Detectamos ese error puntual y recargamos una sola
 * vez (sessionStorage evita un loop si el problema persiste por otra razón).
 */
export default function ChunkErrorHandler() {
  useEffect(() => {
    function manejar(valor: unknown) {
      if (!esErrorDeChunkDesactualizado(valor)) return;
      if (sessionStorage.getItem(CLAVE_YA_RECARGO)) return;
      sessionStorage.setItem(CLAVE_YA_RECARGO, "1");
      window.location.reload();
    }

    function alError(evento: ErrorEvent) {
      manejar(evento.error);
    }
    function alRechazo(evento: PromiseRejectionEvent) {
      manejar(evento.reason);
    }

    window.addEventListener("error", alError);
    window.addEventListener("unhandledrejection", alRechazo);
    return () => {
      window.removeEventListener("error", alError);
      window.removeEventListener("unhandledrejection", alRechazo);
    };
  }, []);

  return null;
}
