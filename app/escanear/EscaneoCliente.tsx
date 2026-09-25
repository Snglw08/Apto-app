"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import styles from "./page.module.css";

// zbar-wasm no devuelve nombres tipo "EAN-13": typeName es el reverse-mapping
// del enum de TypeScript tal cual (confirmado en dist/main.mjs), o sea
// "ZBAR_EAN13", "ZBAR_EAN8", "ZBAR_UPCA", "ZBAR_UPCE".
const TIPOS_VALIDOS_ZBAR = new Set(["ZBAR_EAN13", "ZBAR_EAN8", "ZBAR_UPCA", "ZBAR_UPCE"]);

// Formatos del estándar Shape Detection API (BarcodeDetector), en minúsculas
// con guion bajo — así los define la spec.
const FORMATOS_VALIDOS_NATIVO = new Set(["ean_13", "ean_8", "upc_a", "upc_e"]);

// Banda central que se recorta y se pasa al decodificador, como porcentaje
// de lo que el usuario VE en pantalla (no del video crudo — ver
// calcularRecorteEnVideo, que convierte esto a píxeles del video real
// deshaciendo el recorte/escalado que aplica object-fit: cover). El marco
// guía en pantalla usa los mismos porcentajes.
const RECORTE = { xMin: 0.06, xMax: 0.94, yMin: 0.28, yMax: 0.72 };

type InfoDebug = {
  frame: number;
  loopCorriendo: boolean;
  imageData: { width: number; height: number } | null;
  simbolosCrudos: number;
  typeNames: string[];
  motor: string;
};

// BarcodeDetector (Shape Detection API) todavía no está en las definiciones
// oficiales de TypeScript por ser una API no estándar/experimental — se
// declara acá el mínimo necesario. Solo la implementa Chrome/Chromium en
// Android (usa el detector de códigos de barras nativo del sistema, con
// aceleración de hardware); no existe en Safari/iOS ni en navegadores de
// escritorio, de ahí que se use solo como mejora progresiva.
interface DetectedBarcode {
  format: string;
  rawValue: string;
}

interface BarcodeDetectorInterface {
  detect(imagen: ImageData): Promise<DetectedBarcode[]>;
}

interface BarcodeDetectorConstructor {
  new (opciones: { formats: string[] }): BarcodeDetectorInterface;
}

declare global {
  interface Window {
    BarcodeDetector?: BarcodeDetectorConstructor;
  }
}

type ResultadoDecodificado = { tipo: string; texto: string };

type Decodificador = {
  nombre: string;
  detectar(imagen: ImageData): Promise<ResultadoDecodificado[]>;
};

function esAndroid() {
  if (typeof navigator === "undefined") return false;
  const uaData = (navigator as Navigator & { userAgentData?: { platform?: string } })
    .userAgentData;
  if (uaData?.platform) return uaData.platform === "Android";
  return /Android/i.test(navigator.userAgent);
}

/**
 * BarcodeDetector usa el detector de códigos de barras nativo de Android
 * (Google ML Kit vía la Shape Detection API), mucho más tolerante a
 * desenfoque que zbar-wasm — solo lo implementa Chrome/Chromium en Android,
 * de ahí la restricción explícita además de la detección de soporte.
 */
async function crearDecodificadorNativo(): Promise<Decodificador | null> {
  if (!esAndroid() || typeof window === "undefined" || !window.BarcodeDetector) {
    return null;
  }
  try {
    const detector = new window.BarcodeDetector({
      formats: ["ean_13", "ean_8", "upc_a", "upc_e"],
    });
    return {
      nombre: "nativo",
      async detectar(imagen) {
        const resultados = await detector.detect(imagen);
        return resultados
          .filter((r) => FORMATOS_VALIDOS_NATIVO.has(r.format))
          .map((r) => ({ tipo: r.format, texto: r.rawValue }));
      },
    };
  } catch {
    return null;
  }
}

// setModuleArgs() no es idempotente: construye una instancia WASM NUEVA en
// cada llamada (ver dist/index.d.ts de @undecaf/zbar-wasm). El scanner por
// defecto que usa scanImageData() internamente es un singleton a nivel de
// módulo que no se recrea junto con la instancia — si se llama
// setModuleArgs() en cada montaje de este componente (cada visita a
// /escanear), la segunda visita crea una segunda instancia WASM cuya
// memoria es independiente de la primera, pero el scanner default sigue
// apuntando a la memoria de la primera instancia. Resultado: symbolos
// escaneados con punteros cruzados entre dos instancias WASM distintas, que
// nunca encuentran nada (confirmado con el panel de debug: "símbolos
// crudos: 0" en el segundo escaneo, funcionando de nuevo recién tras
// refrescar la página — que sí recarga el módulo JS entero desde cero). Por
// eso setModuleArgs() se llama una sola vez por carga de página.
let zbarConfigurado = false;

async function crearDecodificadorZbar(): Promise<Decodificador | null> {
  try {
    const zbar = await import("@undecaf/zbar-wasm");
    if (!zbarConfigurado) {
      // zbar.wasm servido como asset propio en public/, nunca desde un CDN.
      zbar.setModuleArgs({ locateFile: () => "/zbar.wasm" });
      zbarConfigurado = true;
    }
    // Fuerza la carga/instanciación del WASM ahora, para detectar acá un
    // fallo (en vez de que quede silencioso hasta el primer frame).
    await zbar.getInstance();
    return {
      nombre: "zbar-wasm",
      async detectar(imagen) {
        const simbolos = await zbar.scanImageData(imagen);
        return simbolos
          .filter((s) => TIPOS_VALIDOS_ZBAR.has(s.typeName))
          .map((s) => ({ tipo: s.typeName, texto: s.decode() }));
      },
    };
  } catch {
    return null;
  }
}

/**
 * En Android/Chrome se prioriza el detector nativo del sistema (mejor
 * enfoque/desenfoque); en cualquier otro caso (Safari/iOS, escritorio, o si
 * el nativo falla al inicializar) se usa zbar-wasm como hasta ahora.
 */
async function crearDecodificador(): Promise<Decodificador | null> {
  const nativo = await crearDecodificadorNativo();
  if (nativo) return nativo;
  return crearDecodificadorZbar();
}

/**
 * object-fit: cover escala el video (preservando proporción) hasta cubrir
 * el contenedor y recorta el sobrante de un solo eje. Esta función deshace
 * ese mapeo: recibe el rectángulo que el usuario ve en pantalla (en
 * porcentaje del contenedor) y devuelve el rectángulo equivalente en
 * píxeles del video crudo (videoWidth/videoHeight), que es lo que hay que
 * pasarle a drawImage/getImageData para que coincida con el marco visual.
 */
function calcularRecorteEnVideo(
  video: HTMLVideoElement,
  contenedorAncho: number,
  contenedorAlto: number,
) {
  const videoAncho = video.videoWidth;
  const videoAlto = video.videoHeight;
  const aspectoVideo = videoAncho / videoAlto;
  const aspectoContenedor = contenedorAncho / contenedorAlto;

  let escala: number;
  let offsetX = 0;
  let offsetY = 0;

  if (aspectoVideo > aspectoContenedor) {
    // El video es relativamente más ancho: cover lo escala por alto y
    // recorta a los costados.
    escala = contenedorAlto / videoAlto;
    offsetX = (videoAncho * escala - contenedorAncho) / 2;
  } else {
    // El video es relativamente más alto: cover lo escala por ancho y
    // recorta arriba/abajo.
    escala = contenedorAncho / videoAncho;
    offsetY = (videoAlto * escala - contenedorAlto) / 2;
  }

  const marcoXPantalla = contenedorAncho * RECORTE.xMin;
  const marcoYPantalla = contenedorAlto * RECORTE.yMin;
  const marcoAnchoPantalla = contenedorAncho * (RECORTE.xMax - RECORTE.xMin);
  const marcoAltoPantalla = contenedorAlto * (RECORTE.yMax - RECORTE.yMin);

  return {
    x: Math.round((marcoXPantalla + offsetX) / escala),
    y: Math.round((marcoYPantalla + offsetY) / escala),
    ancho: Math.round(marcoAnchoPantalla / escala),
    alto: Math.round(marcoAltoPantalla / escala),
  };
}

export default function EscaneoCliente() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const router = useRouter();
  const searchParams = useSearchParams();
  const debugActivo = searchParams.get("debug") === "1";
  const [error, setError] = useState<string | null>(null);
  const [debug, setDebug] = useState<InfoDebug>({
    frame: 0,
    loopCorriendo: false,
    imageData: null,
    simbolosCrudos: 0,
    typeNames: [],
    motor: "—",
  });
  const yaLeido = useRef(false);

  useEffect(() => {
    let activo = true;
    let stream: MediaStream | null = null;
    let frameId = 0;
    let escaneando = false;
    let contadorFrame = 0;

    async function iniciar() {
      const decodificadorCreado = await crearDecodificador();
      if (!decodificadorCreado) {
        if (activo) {
          setError("No pudimos inicializar el lector de códigos. Intenta de nuevo.");
        }
        return;
      }
      if (!activo) return;
      const decodificador = decodificadorCreado;

      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: "environment", width: { ideal: 1280 } },
          audio: false,
        });
      } catch {
        if (activo) {
          setError(
            "No pudimos acceder a la cámara. Revisa los permisos del navegador e intenta de nuevo.",
          );
        }
        return;
      }

      if (!activo || !videoRef.current) {
        stream.getTracks().forEach((track) => track.stop());
        return;
      }

      const video = videoRef.current;
      video.srcObject = stream;
      await video.play().catch(() => {});

      const canvas = document.createElement("canvas");
      const contextoObtenido = canvas.getContext("2d", { willReadFrequently: true });
      if (!contextoObtenido) return;
      const contexto = contextoObtenido;

      async function procesarFrame() {
        if (!activo) return;
        contadorFrame += 1;

        if (
          !escaneando &&
          video.readyState >= video.HAVE_CURRENT_DATA &&
          video.videoWidth > 0
        ) {
          escaneando = true;

          const { x, y, ancho, alto } = calcularRecorteEnVideo(
            video,
            video.clientWidth,
            video.clientHeight,
          );

          canvas.width = ancho;
          canvas.height = alto;
          contexto.drawImage(video, x, y, ancho, alto, 0, 0, ancho, alto);
          const imageData = contexto.getImageData(0, 0, ancho, alto);

          try {
            const simbolos = await decodificador.detectar(imageData);

            setDebug({
              frame: contadorFrame,
              loopCorriendo: true,
              imageData: { width: imageData.width, height: imageData.height },
              simbolosCrudos: simbolos.length,
              typeNames: simbolos.map((s) => s.tipo),
              motor: decodificador.nombre,
            });

            const encontrado = simbolos[0];
            if (encontrado && !yaLeido.current) {
              yaLeido.current = true;
              router.push(`/producto/${encodeURIComponent(encontrado.texto)}`);
              // Recién ACÁ, después de arrancar la navegación (nunca antes:
              // cortar el stream antes del push causó fallos intermitentes
              // en pruebas reales, "This page couldn't load"), se apaga la
              // cámara y el loop de escaneo de forma explícita. No alcanza
              // con confiar en que el cleanup del efecto se dispare al
              // desmontar: en pruebas reales, volver a /escanear después de
              // un primer escaneo exitoso a veces dejaba el stream/loop
              // anterior vivo de fondo, y ese frame viejo (o esa carrera con
              // el stream nuevo) volvía a decodificar el código anterior en
              // vez de leer uno nuevo, hasta reiniciar la app.
              activo = false;
              if (frameId) cancelAnimationFrame(frameId);
              stream?.getTracks().forEach((track) => track.stop());
              return;
            }
          } catch {
            // Error puntual decodificando este frame: se sigue intentando.
          } finally {
            escaneando = false;
          }
        } else {
          setDebug((prev) => ({ ...prev, frame: contadorFrame, loopCorriendo: true }));
        }

        frameId = requestAnimationFrame(procesarFrame);
      }

      frameId = requestAnimationFrame(procesarFrame);
    }

    iniciar();

    return () => {
      activo = false;
      if (frameId) cancelAnimationFrame(frameId);
      stream?.getTracks().forEach((track) => track.stop());
    };
  }, [router]);

  return (
    <div className={styles.pantalla}>
      <video ref={videoRef} className={styles.video} playsInline muted autoPlay />

      <div className={styles.overlay}>
        <header className={styles.header}>
          <h1 className={styles.titulo}>Escanea</h1>
          <Link href="/" className={styles.cerrar} aria-label="Cerrar">
            ✕
          </Link>
        </header>

        {error ? (
          <div className={styles.errorBox}>
            <p>{error}</p>
          </div>
        ) : (
          <>
            <div className={styles.centro}>
              <div className={styles.marco}>
                <span className={`${styles.esquina} ${styles.esquinaTL}`} />
                <span className={`${styles.esquina} ${styles.esquinaTR}`} />
                <span className={`${styles.esquina} ${styles.esquinaBL}`} />
                <span className={`${styles.esquina} ${styles.esquinaBR}`} />
                <span className={styles.lineaEscaneo} />
              </div>
            </div>

            <footer className={styles.footer}>
              <div className={styles.pill}>Apunta al código de barras</div>
              <p className={styles.caption}>¡Lo revisamos al instante! ⚡</p>
            </footer>
          </>
        )}

        {debugActivo && (
          <div className={styles.debug}>
            <div>motor: {debug.motor}</div>
            <div>loop: {debug.loopCorriendo ? `corriendo (frame ${debug.frame})` : "parado"}</div>
            <div>
              imageData: {debug.imageData ? `${debug.imageData.width}×${debug.imageData.height}` : "—"}
            </div>
            <div>símbolos crudos: {debug.simbolosCrudos}</div>
            <div>typeNames: {debug.typeNames.length ? debug.typeNames.join(", ") : "—"}</div>
          </div>
        )}
      </div>
    </div>
  );
}
