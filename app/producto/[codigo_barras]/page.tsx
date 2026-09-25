"use client";

import { useEffect, useState, type ReactNode } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { useIrAEscanear } from "../../escanear/ir-a-escanear";
import {
  IconoAdvertencia,
  IconoCamara,
  IconoCaja,
  IconoCheck,
  IconoEnlace,
  IconoInfo,
  IconoInicio,
  IconoX,
} from "../../icons";
import styles from "./page.module.css";

type Origen = "productos_propios" | "off_cache";

type Producto = {
  codigo_barras: string;
  nombre: string | null;
  marca: string | null;
  ingredientes: string | null;
  fuente?: "off" | "ocr" | "manual";
  sellos?: string[];
  states_tags?: string[];
  last_modified_t?: number | null;
  data_quality_errors_tags?: string[];
};

type Regla = { tipo: "vetado" | "recomendado"; ingrediente_clave: string };

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

type Veredicto =
  | { estado: "vetado" | "neutro" | "recomendado"; motivo: string }
  | { estado: "incompleto" };

const STORAGE_KEY = "apto-vinculacion";
const DOS_ANIOS_EN_SEGUNDOS = 2 * 365.25 * 24 * 3600;

// Regla central del proyecto (ver "El semáforo" en el README): el semáforo
// nunca muestra verde si el dato viene de OFF y está incompleto,
// desactualizado o con errores de calidad. Ante la duda,
// jamás declarar un producto apto. Mismo criterio para fuente 'ocr' (foto sin
// verificar): puede vetar por seguridad, pero nunca recomienda en verde.
function calcularVeredicto(producto: Producto, origen: Origen, reglas: Regla[]): Veredicto {
  if (origen === "off_cache") {
    const statesTags = producto.states_tags ?? [];
    const dataQualityErrors = producto.data_quality_errors_tags ?? [];
    const lastModified = producto.last_modified_t ?? null;
    const desactualizado =
      !lastModified || Date.now() / 1000 - lastModified > DOS_ANIOS_EN_SEGUNDOS;

    if (
      !statesTags.includes("en:ingredients-completed") ||
      desactualizado ||
      dataQualityErrors.length > 0
    ) {
      return { estado: "incompleto" };
    }
  }

  const ingredientesTexto = (producto.ingredientes ?? "").toLowerCase();
  if (!ingredientesTexto.trim()) {
    return { estado: "incompleto" };
  }

  // OCR sin verificar: se permite VETADO (por seguridad, ante la duda se
  // avisa igual), pero jamás RECOMENDADO — un dato sin verificar nunca
  // habilita el "verde". Ver nota en el header de esta función.
  const sinVerificar = producto.fuente === "ocr";

  const vetados = reglas.filter(
    (r) => r.tipo === "vetado" && ingredientesTexto.includes(r.ingrediente_clave.toLowerCase()),
  );
  if (vetados.length > 0) {
    return {
      estado: "vetado",
      motivo: `Tu nutricionista no recomienda este producto por contener ${vetados
        .map((r) => r.ingrediente_clave)
        .join(", ")}.`,
    };
  }

  const recomendados = reglas.filter(
    (r) =>
      r.tipo === "recomendado" && ingredientesTexto.includes(r.ingrediente_clave.toLowerCase()),
  );
  if (recomendados.length > 0) {
    if (sinVerificar) {
      return {
        estado: "neutro",
        motivo: `Contiene ${recomendados
          .map((r) => r.ingrediente_clave)
          .join(", ")}, que tu nutricionista recomienda — pero este producto lo agregaste tú por foto y todavía no está verificado, así que no lo marcamos como recomendado.`,
      };
    }
    return {
      estado: "recomendado",
      motivo: `Contiene ${recomendados
        .map((r) => r.ingrediente_clave)
        .join(", ")}, que tu nutricionista recomienda para ti.`,
    };
  }

  return {
    estado: "neutro",
    motivo: "No encontramos restricciones ni recomendaciones para este producto. Con moderación, sin problema.",
  };
}

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

function LinkInicio() {
  return (
    <Link href="/" className={styles.linkInicio} aria-label="Ir al inicio">
      <IconoInicio size={18} />
    </Link>
  );
}

export default function ProductoPage() {
  const params = useParams<{ codigo_barras: string }>();
  const codigoBarras = params.codigo_barras;
  const irAEscanear = useIrAEscanear();

  // Se guarda junto al código que la originó: así "cargando" se deriva en el
  // render en vez de necesitar un setState síncrono al inicio del efecto.
  const [resultado, setResultado] = useState<{
    codigoBarras: string;
    estado: EstadoResuelto;
  } | null>(null);

  // undefined = todavía no se revisó localStorage; null = no vinculado.
  const [vinculo, setVinculo] = useState<Vinculo | null | undefined>(undefined);
  // null = reglas no cargadas todavía (o no aplica); [] es un valor válido y "listo".
  const [reglas, setReglas] = useState<Regla[] | null>(null);

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
      })
      .catch(() => {
        if (activo) setResultado({ codigoBarras, estado: { tipo: "error" } });
      });

    return () => {
      activo = false;
    };
  }, [codigoBarras]);

  useEffect(() => {
    let activo = true;
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

    fetch(`/api/pacientes/${encodeURIComponent(parseado.pacienteId)}/reglas`)
      .then((res): Promise<unknown> => (res.ok ? res.json() : Promise.resolve({ reglas: [] })))
      .then((data) => {
        const { reglas: reglasRecibidas } = data as { reglas: Regla[] };
        if (activo) setReglas(reglasRecibidas ?? []);
      })
      .catch(() => {
        if (activo) setReglas([]);
      });

    return () => {
      activo = false;
    };
  }, []);

  const estado: Estado =
    resultado && resultado.codigoBarras === codigoBarras
      ? resultado.estado
      : { tipo: "cargando" };

  if (estado.tipo === "cargando") {
    return (
      <div className={styles.centrado}>
        <p className={styles.mensaje}>Buscando producto…</p>
        <Link href="/" className={styles.link}>
          Volver al inicio
        </Link>
      </div>
    );
  }

  if (estado.tipo === "error") {
    return (
      <div className={styles.centrado}>
        <p className={styles.mensaje}>
          Hubo un problema buscando el producto. Intenta de nuevo.
        </p>
        <Link href="/escanear" onClick={irAEscanear} className={styles.link}>
          ‹ Escanear
        </Link>
        <Link href="/" className={styles.link}>
          Volver al inicio
        </Link>
      </div>
    );
  }

  if (estado.tipo === "no-encontrado") {
    return (
      <div className={styles.noEncontrado}>
        <header className={styles.header}>
          <Link href="/escanear" onClick={irAEscanear} className={styles.link}>
            ‹ Escanear
          </Link>
          <LinkInicio />
        </header>

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

        <p className={styles.caption}>Producto agregado por ti, sin verificar</p>
      </div>
    );
  }

  const { producto, origen } = estado;
  const sellos = producto.sellos ?? [];

  // Recién con vinculo Y reglas resueltos se intenta un veredicto; mientras
  // tanto (o si no está vinculado) se muestra la ficha simple, sin banner.
  const veredicto: Veredicto | null =
    vinculo && reglas ? calcularVeredicto(producto, origen, reglas) : null;

  if (veredicto?.estado === "incompleto") {
    return (
      <div className={styles.noEncontrado}>
        <header className={styles.header}>
          <Link href="/escanear" onClick={irAEscanear} className={styles.link}>
            ‹ Escanear
          </Link>
          <LinkInicio />
        </header>

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
          <button type="button" className={styles.botonSecundario}>
            Buscar por nombre
          </button>
        </div>

        <p className={styles.caption}>Producto agregado por ti, sin verificar</p>
      </div>
    );
  }

  const config = veredicto ? CONFIG_VEREDICTO[veredicto.estado] : null;

  return (
    <div className={styles.pagina}>
      {config && veredicto ? (
        <div className={`${styles.banner} ${config.claseBanner}`}>
          <div className={styles.bannerHeader}>
            <Link href="/escanear" onClick={irAEscanear} className={styles.bannerEnlace}>
              ‹ Escanear
            </Link>
          </div>
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
      ) : (
        <header className={styles.header}>
          <Link href="/escanear" onClick={irAEscanear} className={styles.link}>
            ‹ Escanear
          </Link>
          <LinkInicio />
        </header>
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

        {sellos.length > 0 && (
          <div>
            <p className={styles.eyebrow}>Sellos</p>
            <div className={styles.sellosFila}>
              {sellos.map((sello) => (
                <span key={sello} className={styles.sello}>
                  {sello}
                </span>
              ))}
            </div>
          </div>
        )}

        {producto.ingredientes && (
          <div>
            <p className={styles.eyebrow}>Ingredientes</p>
            <p className={styles.ingredientes}>{producto.ingredientes}</p>
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

      {config && veredicto && (
        <div className={styles.inicioAbajo}>
          <Link href="/" className={styles.linkInicioGrande} aria-label="Ir al inicio">
            <IconoInicio size={36} />
          </Link>
        </div>
      )}
    </div>
  );
}
