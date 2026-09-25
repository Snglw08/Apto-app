import { Suspense } from "react";
import EscaneoDinamico from "./EscaneoDinamico";

// El escáner usa getUserMedia y WebAssembly (zbar-wasm): es exclusivamente
// de cliente. La carga dinámica con ssr:false (en EscaneoDinamico, un
// Client Component — next/dynamic con ssr:false no se permite acá, en un
// Server Component) evita que Next intente renderizar/prerenderizar el
// escáner en el servidor (workerd en producción), donde esas APIs no
// existen.
//
// Suspense: EscaneoDinamico usa useSearchParams() (para el ?t= que fuerza
// el remount al reingresar a /escanear, ver ir-a-escanear.ts) y esta ruta
// se prerenderiza como estática — sin este boundary el build falla con
// "useSearchParams() should be wrapped in a suspense boundary".
export default function EscanearPage() {
  return (
    <Suspense fallback={null}>
      <EscaneoDinamico />
    </Suspense>
  );
}
