import type { Origen, Producto } from "@/lib/veredicto";

/**
 * Historial de escaneos recientes, en localStorage.
 *
 * Vive en el dispositivo y no en la base, por dos motivos. Uno es de
 * arquitectura: es la misma decisión que ya tomó la vinculación, que también
 * guarda su estado acá (el README lo documenta como limitación conocida — no
 * sincroniza entre dispositivos). El otro es de privacidad: qué productos
 * escanea un paciente es información sensible, y guardarla en el servidor sería
 * una decisión que este proyecto no necesita tomar.
 *
 * ⚠️ Lo que NO se guarda: el veredicto.
 *
 * Sería lo intuitivo —"Leche Entera: VETADO"— y está mal. El veredicto depende
 * de las reglas del paciente, y esas cambian: si el nutricionista agrega un
 * ingrediente vetado, un veredicto guardado seguiría mostrando el color viejo.
 * Sería exactamente el mismo fallo que arreglamos en el semáforo — un veredicto
 * desactualizado presentado como si fuera actual — con otro disfraz.
 *
 * Por eso se guardan los campos que necesita `calcularVeredicto` y el color se
 * recalcula en cada render, contra las reglas vigentes. Esa función es pura, así
 * que recalcular cuesta nada.
 */

const CLAVE = "apto-historial";

/** Cinco alcanza para "lo que escaneé hoy" sin volverse una pantalla aparte. */
const MAXIMO = 5;

export type EntradaHistorial = {
  producto: Producto;
  origen: Origen;
  /** Cuándo se escaneó, en milisegundos. */
  visto: number;
};

function esEntrada(valor: unknown): valor is EntradaHistorial {
  if (typeof valor !== "object" || valor === null) return false;
  const e = valor as Record<string, unknown>;
  const p = e.producto as Record<string, unknown> | undefined;
  return (
    typeof p === "object" &&
    p !== null &&
    typeof p.codigo_barras === "string" &&
    typeof e.visto === "number" &&
    (e.origen === "off_cache" || e.origen === "productos_propios")
  );
}

/**
 * Lee el historial. Devuelve [] ante cualquier problema —sin localStorage, JSON
 * roto, formato viejo— porque acá un historial vacío es una degradación
 * aceptable: no se pierde información crítica ni se muestra nada incorrecto.
 * Distinto del caso de las reglas, donde vacío y error significan cosas opuestas.
 */
export function leerHistorial(): EntradaHistorial[] {
  try {
    const guardado = localStorage.getItem(CLAVE);
    if (!guardado) return [];
    const datos: unknown = JSON.parse(guardado);
    if (!Array.isArray(datos)) return [];
    return datos.filter(esEntrada).slice(0, MAXIMO);
  } catch {
    return [];
  }
}

/**
 * Agrega un producto al principio. Si ya estaba, sube al tope en vez de
 * duplicarse: escanear dos veces lo mismo no debería llenar la lista.
 */
export function registrarEscaneo(producto: Producto, origen: Origen): void {
  try {
    const sinEste = leerHistorial().filter(
      (e) => e.producto.codigo_barras !== producto.codigo_barras,
    );
    const nuevo: EntradaHistorial[] = [
      { producto, origen, visto: Date.now() },
      ...sinEste,
    ].slice(0, MAXIMO);
    localStorage.setItem(CLAVE, JSON.stringify(nuevo));
  } catch {
    // Sin localStorage (modo privado, cuota llena) el historial simplemente no
    // se guarda. No es motivo para romper la pantalla de producto.
  }
}

export function limpiarHistorial(): void {
  try {
    localStorage.removeItem(CLAVE);
  } catch {
    // Ídem.
  }
}

/** "hace 2 h", "ayer", "hace 3 días". Sin librería: son cuatro casos. */
export function haceCuanto(desde: number, ahora: number = Date.now()): string {
  const minutos = Math.floor((ahora - desde) / 60000);
  if (minutos < 1) return "recién";
  if (minutos < 60) return `hace ${minutos} min`;

  const horas = Math.floor(minutos / 60);
  if (horas < 24) return `hace ${horas} h`;

  const dias = Math.floor(horas / 24);
  if (dias === 1) return "ayer";
  return `hace ${dias} días`;
}
