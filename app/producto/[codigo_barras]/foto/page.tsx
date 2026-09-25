"use client";

import { useEffect, useRef, useState, type ChangeEvent } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { IconoCamara, IconoInicio } from "../../../icons";
import styles from "../page.module.css";

type Estado = { tipo: "instrucciones" } | { tipo: "subiendo" } | { tipo: "error"; mensaje: string };

// La demora real es la propia llamada a Gemini (unos segundos, no hay mucho
// margen para acelerarla) — esto no acorta la espera, la hace sentir más
// corta: mensajes que van cambiando en vez de un texto fijo, en sincronía
// con una barra que avanza (ver .barraCargaRelleno en page.module.css).
const MENSAJES_CARGA = [
  "Analizando la foto…",
  "Buscando la lista de ingredientes…",
  "Leyendo el texto…",
  "Ya casi…",
];
const INTERVALO_MENSAJE_MS = 2200;

const LADO_MAXIMO = 1200;
const CALIDAD_JPEG = 0.7;

function canvasABlob(canvas: HTMLCanvasElement): Promise<Blob | null> {
  return new Promise((resolve) => canvas.toBlob(resolve, "image/jpeg", CALIDAD_JPEG));
}

/**
 * Redimensiona a máximo 1200px en el lado más largo y reexporta como JPEG
 * calidad 0.7 antes de subir — las fotos de cámara vienen pesadas (varios MB)
 * sin necesidad para que Gemini lea una lista de ingredientes.
 *
 * imageOrientation: "from-image" en createImageBitmap es la parte crítica:
 * sin esto, el bitmap decodificado ignora el tag EXIF de orientación y la
 * foto puede quedar rotada 90°/180° al dibujarla en el canvas — eso hace que
 * el OCR lea mal o no encuentre la lista de ingredientes. Con "from-image" la
 * rotación ya viene aplicada en los píxeles del bitmap.
 *
 * Si algo falla acá (formato no soportado, etc.), se sube el archivo
 * original tal cual — mejor una foto pesada que un flujo roto.
 */
async function comprimirImagen(archivo: File): Promise<File | Blob> {
  try {
    const bitmap = await createImageBitmap(archivo, { imageOrientation: "from-image" });

    const escala = Math.min(1, LADO_MAXIMO / Math.max(bitmap.width, bitmap.height));
    const ancho = Math.round(bitmap.width * escala);
    const alto = Math.round(bitmap.height * escala);

    const canvas = document.createElement("canvas");
    canvas.width = ancho;
    canvas.height = alto;
    const contexto = canvas.getContext("2d");
    if (!contexto) return archivo;

    contexto.drawImage(bitmap, 0, 0, ancho, alto);
    bitmap.close();

    const blob = await canvasABlob(canvas);
    return blob ?? archivo;
  } catch {
    return archivo;
  }
}

export default function FotoIngredientesPage() {
  const params = useParams<{ codigo_barras: string }>();
  const codigoBarras = params.codigo_barras;
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [estado, setEstado] = useState<Estado>({ tipo: "instrucciones" });
  const [nombre, setNombre] = useState("");
  const [mensajeIndice, setMensajeIndice] = useState(0);

  useEffect(() => {
    if (estado.tipo !== "subiendo") {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setMensajeIndice(0);
      return;
    }
    const id = setInterval(() => {
      setMensajeIndice((i) => Math.min(i + 1, MENSAJES_CARGA.length - 1));
    }, INTERVALO_MENSAJE_MS);
    return () => clearInterval(id);
  }, [estado.tipo]);

  function abrirCamara() {
    if (!nombre.trim()) return;
    inputRef.current?.click();
  }

  async function handleArchivo(evento: ChangeEvent<HTMLInputElement>) {
    const archivo = evento.target.files?.[0];
    evento.target.value = ""; // permite volver a elegir el mismo archivo si reintenta
    if (!archivo) return;

    setEstado({ tipo: "subiendo" });

    const fotoComprimida = await comprimirImagen(archivo);

    const formData = new FormData();
    formData.append("foto", fotoComprimida, "foto.jpg");
    formData.append("nombre", nombre.trim());

    let res: Response;
    try {
      res = await fetch(`/api/producto/${encodeURIComponent(codigoBarras)}/foto`, {
        method: "POST",
        body: formData,
      });
    } catch {
      setEstado({
        tipo: "error",
        mensaje: "No pudimos conectar. Revisa tu conexión a internet e intenta de nuevo.",
      });
      return;
    }

    if (res.ok) {
      router.push(`/producto/${encodeURIComponent(codigoBarras)}`);
      return;
    }

    const data = (await res.json().catch(() => null)) as { error?: string } | null;
    setEstado({
      tipo: "error",
      mensaje: data?.error || "No pudimos leer la foto. Intenta de nuevo.",
    });
  }

  return (
    <div className={styles.noEncontrado}>
      <header className={styles.header}>
        <Link href={`/producto/${codigoBarras}`} className={styles.link}>
          ‹ Volver
        </Link>
        <Link href="/" className={styles.linkInicio} aria-label="Ir al inicio">
          <IconoInicio size={18} />
        </Link>
      </header>

      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        capture="environment"
        hidden
        onChange={handleArchivo}
      />

      <div className={styles.noEncontradoContenido}>
        {estado.tipo === "subiendo" ? (
          <>
            <h1 className={styles.tituloNoEncontrado}>Leyendo los ingredientes…</h1>
            <div className={styles.barraCargaTrack} aria-hidden="true">
              <div className={styles.barraCargaRelleno} />
            </div>
            <p className={styles.textoNoEncontrado}>{MENSAJES_CARGA[mensajeIndice]}</p>
          </>
        ) : (
          <>
            <div className={styles.badge} aria-hidden="true">
              <IconoCamara size={30} />
            </div>
            <h1 className={styles.tituloNoEncontrado}>Fotografía los ingredientes</h1>
            <p className={styles.textoNoEncontrado}>
              Encuadra bien la lista de ingredientes del envase, con buena luz, para que
              podamos leerla.
            </p>

            <div className={styles.campoNombre}>
              <label className={styles.etiquetaNombre} htmlFor="nombre-producto">
                Nombre del producto
              </label>
              <input
                id="nombre-producto"
                className={styles.inputNombre}
                type="text"
                value={nombre}
                onChange={(e) => setNombre(e.target.value)}
                placeholder="Ej. Galletas de avena"
                autoComplete="off"
              />
            </div>

            {estado.tipo === "error" && <p className={styles.errorFoto}>{estado.mensaje}</p>}

            <button
              type="button"
              className={styles.botonPrimario}
              onClick={abrirCamara}
              disabled={!nombre.trim()}
            >
              {estado.tipo === "error" ? (
                "Intentar de nuevo"
              ) : (
                <>
                  <IconoCamara size={18} />
                  Abrir cámara
                </>
              )}
            </button>
          </>
        )}
      </div>
    </div>
  );
}
