import { useRouter } from "next/navigation";
import type { MouseEvent } from "react";

/**
 * Cada visita a /escanear tiene que ser una navegación distinta para
 * Next.js (ver EscaneoDinamico.tsx: sin esto, volver a esa pantalla podía
 * reusar la instancia anterior y la cámara no se reiniciaba). El timestamp
 * no puede ir directo en el href — llamar Date.now() durante el render
 * rompe las reglas de pureza de React — así que se arma recién al clic.
 */
export function useIrAEscanear() {
  const router = useRouter();
  return function irAEscanear(evento: MouseEvent) {
    evento.preventDefault();
    router.push(`/escanear?t=${Date.now()}`);
  };
}
