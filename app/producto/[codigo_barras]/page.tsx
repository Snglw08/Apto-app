"use client";

import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import {
  IconoAdvertencia,
  IconoCamara,
  IconoCaja,
  IconoCheck,
  IconoEnlace,
  IconoInfo,
  IconoX,
} from "../../icons";
import { registrarEscaneo } from "@/lib/historial";
import {
  calcularVeredicto,
  type Origen,
  type Producto,
  type Regla,
  type Veredicto,
} from "@/lib/veredicto";
import styles from "./page.module.css";

type Vinculo = {
  pacienteId: string;
  pacienteNombre: string;
  nutricionistaNombre: string | null;
};

type EstadoResuelto =
  | { tipo: "encontrado"; producto: Producto; origen: Origen }
  | { tipo: "no-encontrado" }
  | { tipo: "error" };

type Estado = { tipo: "cargando" } | EstadoResuelto;

// "listas" con una lista vacía significa "este paciente no tiene reglas".
// "error" significa "no sabemos qué reglas tiene". Son dos cosas distintas y
// por eso no pueden compartir representación: cuando un fallo de red se
// guardaba como lista vacía, el semáforo calculaba un veredicto con cero
// reglas y mostraba NEUTRO ("con moderación, sin problema") para un producto
// que podía estar vetado. Ver la regla del semáforo en el README.
type EstadoReglas =
  | { tipo: "cargando" }
  | { tipo: "listas"; reglas: Regla[] }
  | { tipo: "error" };

const STORAGE_KEY = "apto-vinculacion";

const CONFIG_VEREDICTO: Record<
  "vetado" | "neutro" | "recomendado",
  {
    icono: ReactNode;
    palabra: string;
    subtitulo: string;
    claseBanner: string;
    claseMotivo: string;
    indiceActivo: number;
  }
> = {
  vetado: {
    icono: <IconoX size={32} />,
    palabra: "NO RECOMENDADO",
    subtitulo: "Este no va con tu plan 🚫",
    claseBanner: styles.bannerVetado,
    claseMotivo: styles.motivoVetado,
    indiceActivo: 0,
  },
  neutro: {
    icono: "–",
    palabra: "NEUTRO",
    subtitulo: "Tú decides, con moderación",
    claseBanner: styles.bannerNeutro,
    claseMotivo: styles.motivoNeutro,
    indiceActivo: 1,
  },
  recomendado: {
    icono: <IconoCheck size={32} />,
    palabra: "RECOMENDADO",
    subtitulo: "¡Llévalo sin miedo! 🙌",
    claseBanner: styles.bannerRecomendado,
    claseMotivo: styles.motivoRecomendado,
    indiceActivo: 2,
  },
};

/**
 * Decodifica las entidades HTML que trae el texto de ingredientes de OFF.
 *
 * Los ingredientes los cargan colaboradores desde un formulario web, y una
 * parte llega con comillas escapadas: medido sobre el catálogo cacheado, 37
 * productos traen `&quot;` literal. React escapa por defecto —que es lo que lo
 * protege de HTML inyectado— así que esa cadena se renderiza tal cual y el
 * usuario lee `&quot;COCA-COLA` en la ficha.
 *
 * Se decodifica acá, al mostrar, y no al guardar en off_cache: el caché sigue
 * siendo un espejo fiel de lo que devolvió OFF, y la normalización es una
 * decisión de presentación. Es una tabla explícita y no un innerHTML: decodificar
 * con el DOM abriría la puerta a interpretar etiquetas de un texto que viene de
 * terceros.
 */
const ENTIDADES: Record<string, string> = {
  "&quot;": '"',
  "&amp;": "&",
  "&#039;": "'",
  "&#39;": "'",
  "&apos;": "'",
  "&lt;": "<",
  "&gt;": ">",
  "&nbsp;": " ",
};

function decodificarEntidades(texto: string): string {
  return texto.replace(/&(?:quot|amp|#0?39|apos|lt|gt|nbsp);/g, (e) => ENTIDADES[e] ?? e);
}

export default function ProductoPage() {
  const params = useParams<{ codigo_barras: string }>();
  const codigoBarras = params.codigo_barras;

  // Se guarda junto al código que la originó: así "cargando" se deriva en el
  // render en vez de necesitar un setState síncrono al inicio del efecto.
  const [resultado, setResultado] = useState<{
    codigoBarras: string;
    estado: EstadoResuelto;
  } | null>(null);

  // undefined = todavía no se revisó localStorage; null = no vinculado.
  const [vinculo, setVinculo] = useState<Vinculo | null | undefined>(undefined);
  const [estadoReglas, setEstadoReglas] = useState<EstadoReglas>({ tipo: "cargando" });

  // Con el botón de reintentar puede haber más de una petición en vuelo, y la
  // primera en salir no es necesariamente la primera en volver. Solo la última
  // pedida tiene derecho a escribir el estado.
  const peticionReglas = useRef(0);

  const cargarReglas = useCallback(async (pacienteId: string) => {
    const idPeticion = ++peticionReglas.current;
    setEstadoReglas({ tipo: "cargando" });

    try {
      const res = await fetch(`/api/pacientes/${encodeURIComponent(pacienteId)}/reglas`);
      if (idPeticion !== peticionReglas.current) return;

      if (!res.ok) {
        setEstadoReglas({ tipo: "error" });
        return;
      }

      const data = (await res.json()) as { reglas?: unknown };
      if (idPeticion !== peticionReglas.current) return;

      // Una respuesta 200 con un cuerpo que no es la lista esperada es un
      // fallo, no "cero reglas". Caer a [] acá sería reintroducir el mismo bug
      // por la puerta de atrás.
      if (!Array.isArray(data.reglas)) {
        setEstadoReglas({ tipo: "error" });
        return;
      }

      setEstadoReglas({ tipo: "listas", reglas: data.reglas as Regla[] });
    } catch {
      if (idPeticion === peticionReglas.current) setEstadoReglas({ tipo: "error" });
    }
  }, []);

  useEffect(() => {
    let activo = true;

    fetch(`/api/producto/${encodeURIComponent(codigoBarras)}`)
      .then(async (res) => {
        if (!activo) return;
        if (res.status === 404) {
          setResultado({ codigoBarras, estado: { tipo: "no-encontrado" } });
          return;
        }
        if (!res.ok) {
          setResultado({ codigoBarras, estado: { tipo: "error" } });
          return;
        }
        const data = (await res.json()) as { producto: Producto; origen: Origen };
        setResultado({
          codigoBarras,
          estado: { tipo: "encontrado", producto: data.producto, origen: data.origen },
        });
        // Al historial va el producto, nunca el veredicto: ese se recalcula en
        // el inicio contra las reglas vigentes. Ver lib/historial.ts.
        registrarEscaneo(data.producto, data.origen);
      })
      .catch(() => {
        if (activo) setResultado({ codigoBarras, estado: { tipo: "error" } });
      });

    return () => {
      activo = false;
    };
  }, [codigoBarras]);

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
    void cargarReglas(parseado.pacienteId);
  }, [cargarReglas]);

  const estado: Estado =
    resultado && resultado.codigoBarras === codigoBarras
      ? resultado.estado
      : { tipo: "cargando" };

  if (estado.tipo === "cargando") {
    return (
      <div className={styles.centrado}>
        <p className={styles.mensaje}>Buscando producto…</p>
      </div>
    );
  }

  if (estado.tipo === "error") {
    return (
      <div className={styles.centrado}>
        <p className={styles.mensaje}>
          Hubo un problema buscando el producto. Intenta de nuevo.
        </p>
      </div>
    );
  }

  if (estado.tipo === "no-encontrado") {
    return (
      <div className={styles.noEncontrado}>

        <div className={styles.noEncontradoContenido}>
          <div className={styles.badge} aria-hidden="true">
            <IconoCaja size={30} />
          </div>
          <h1 className={styles.tituloNoEncontrado}>¡Ups! No lo tenemos aún</h1>
          <p className={styles.textoNoEncontrado}>
            Sácale una foto a los INGREDIENTES (no a la tabla nutricional). ¡Nuestra IA se
            encargará rápidamente!
          </p>
          <Link href={`/producto/${codigoBarras}/foto`} className={styles.botonPrimario}>
            <IconoCamara size={18} />
            Tomar foto de la etiqueta
          </Link>
          <button type="button" className={styles.botonSecundario} disabled>
            Buscar por nombre <span className={styles.etiquetaProximamente}>Próximamente</span>
          </button>
        </div>

        {/* El texto de acá abajo decía "Producto agregado por ti, sin
            verificar", y en esta pantalla todavía no se agregó nada: el
            producto no existe en ninguna tabla ni en Open Food Facts. Ese
            texto describe lo que pasa DESPUÉS de la foto, no antes. */}
        <p className={styles.caption}>
          Este código no está en Open Food Facts ni en nuestra base
        </p>
      </div>
    );
  }

  const { producto, origen } = estado;

  // Recién con vinculo Y reglas efectivamente cargadas se intenta un veredicto.
  // Mientras cargan, si no está vinculado, o si la consulta falló, se muestra la
  // ficha simple sin banner: sin saber las reglas del paciente no se emite
  // ningún veredicto, ni siquiera "neutro".
  const veredicto: Veredicto | null =
    vinculo && estadoReglas.tipo === "listas"
      ? calcularVeredicto(producto, origen, estadoReglas.reglas)
      : null;

  const reglasFallaron = Boolean(vinculo) && estadoReglas.tipo === "error";

  if (veredicto?.estado === "incompleto") {
    return (
      <div className={styles.noEncontrado}>

        <div className={styles.noEncontradoContenido}>
          <div className={styles.badge} aria-hidden="true">
            <IconoInfo size={30} />
          </div>
          <h1 className={styles.tituloNoEncontrado}>Nos faltan datos de este producto</h1>
          <p className={styles.textoNoEncontrado}>
            No tenemos información suficiente para confirmar si es apto para ti. Sácale una
            foto a la etiqueta y lo revisamos.
          </p>
          <Link href={`/producto/${codigoBarras}/foto`} className={styles.botonPrimario}>
            <IconoCamara size={18} />
            Tomar foto de la etiqueta
          </Link>
          <button type="button" className={styles.botonSecundario} disabled>
            Buscar por nombre <span className={styles.etiquetaProximamente}>Próximamente</span>
          </button>
        </div>

        {/* Este producto SÍ existe en off_cache: lo que falta es calidad de dato
            (ingredientes incompletos, más de 2 años sin actualizar, o errores que
            reporta OFF). No se muestra ningún valor de Open Food Facts en esta
            pantalla —ni nombre ni ingredientes— así que no lleva atribución; si
            algún día se mostraran, la regla de atribución visible aplica acá
            también. */}
        <p className={styles.caption}>
          Los datos de este producto están incompletos o desactualizados
        </p>
      </div>
    );
  }

  const config = veredicto ? CONFIG_VEREDICTO[veredicto.estado] : null;

  return (
    <div className={styles.pagina}>
      {config && veredicto && (
        <div className={`${styles.banner} ${config.claseBanner}`}>
          <div className={styles.bannerIcono} aria-hidden="true">
            {config.icono}
          </div>
          <p
            className={`${styles.bannerPalabra} ${
              veredicto.estado !== "neutro" ? styles.bannerPalabraChica : ""
            }`}
          >
            {config.palabra}
          </p>
          <p className={styles.bannerSubtitulo}>{config.subtitulo}</p>
          <div className={styles.bannerPuntos}>
            {[0, 1, 2].map((i) => (
              <span
                key={i}
                className={`${styles.bannerPunto} ${
                  i === config.indiceActivo ? styles.bannerPuntoActivo : ""
                }`}
              />
            ))}
          </div>
        </div>
      )}

      <div className={styles.tarjeta}>
        {producto.fuente === "ocr" && (
          <span className={styles.sinVerificar}>
            <IconoAdvertencia size={14} />
            Producto sin verificar aún
          </span>
        )}

        <div>
          <h1 className={styles.nombre}>{producto.nombre ?? "Producto sin nombre"}</h1>
          {producto.marca && <p className={styles.marca}>{producto.marca}</p>}
        </div>

        {config && veredicto && (
          <div className={`${styles.motivo} ${config.claseMotivo}`}>
            {veredicto.motivo}
          </div>
        )}

        {reglasFallaron && (
          <div className={styles.avisoReglas}>
            <p className={styles.avisoReglasTitulo}>
              <IconoAdvertencia size={15} />
              No pudimos revisar tus reglas
            </p>
            <p className={styles.avisoReglasTexto}>
              No logramos cargar los ingredientes que tu nutricionista definió para ti, así
              que <strong>no podemos decirte si este producto es apto</strong>. Vuelve a
              intentar en un momento; si el problema sigue, revisa tu vínculo en tu perfil.
            </p>
            <button
              type="button"
              className={styles.avisoReglasBoton}
              onClick={() => {
                if (vinculo) void cargarReglas(vinculo.pacienteId);
              }}
            >
              Reintentar
            </button>
          </div>
        )}

        {vinculo === null && (
          <div className={styles.avisoVinculo}>
            <p className={styles.avisoVinculoTexto}>
              Conéctate con tu nutricionista para ver tus productos recomendados.
            </p>
            <Link href="/vinculacion" className={styles.avisoVinculoBoton}>
              <IconoEnlace size={16} />
              Conectar ahora
            </Link>
          </div>
        )}

        {producto.ingredientes && (
          <div>
            <p className={styles.eyebrow}>Ingredientes</p>
            <p className={styles.ingredientes}>{decodificarEntidades(producto.ingredientes)}</p>
          </div>
        )}

        {origen === "off_cache" && (
          <p className={styles.atribucionOff}>
            Datos de{" "}
            <a
              href="https://world.openfoodfacts.org"
              target="_blank"
              rel="noreferrer"
              className={styles.atribucionOffEnlace}
            >
              Open Food Facts
            </a>{" "}
            (ODbL). Información colaborativa, puede estar incompleta o desactualizada.
          </p>
        )}
      </div>

    </div>
  );
}
