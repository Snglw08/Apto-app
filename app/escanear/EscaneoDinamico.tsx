"use client";

import dynamic from "next/dynamic";
import { useSearchParams } from "next/navigation";

// next/dynamic con ssr:false solo se permite en un Client Component (no en
// el Server Component de page.tsx) — de ahí este archivo intermedio.
const EscaneoCliente = dynamic(() => import("./EscaneoCliente"), { ssr: false });

export default function EscaneoDinamico() {
  const searchParams = useSearchParams();

  // key={...}: en pruebas reales, volver a /escanear después de haber
  // escaneado un código a veces reusaba la instancia anterior en vez de
  // montar una nueva — el useEffect que arranca la cámara nunca se volvía a
  // ejecutar, y la pantalla quedaba muerta hasta refrescar. Cada link a
  // /escanear agrega un ?t= distinto (ver app/page.tsx, vinculacion,
  // producto); usarlo como key obliga a React a desmontar y montar de cero
  // sin importar qué decida cachear Next.js internamente.
  return <EscaneoCliente key={searchParams.toString()} />;
}
