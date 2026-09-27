"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { IconoEnlace, IconoInfo, IconoPersona } from "./icons";
import { haceCuanto, leerHistorial, type EntradaHistorial } from "@/lib/historial";
import { calcularVeredicto, type Regla } from "@/lib/veredicto";
import styles from "./page.module.css";

const STORAGE_KEY = "apto-vinculacion";

type Vinculo = {
  pacienteId: string;
  pacienteNombre: string;
  nutricionistaNombre: string | null;
};

/** Color del punto de cada ítem del historial, por estado del semáforo. */
const CLASE_PUNTO: Record<"vetado" | "neutro" | "recomendado" | "incompleto", string> = {
  vetado: styles.puntoVetado,
  neutro: styles.puntoNeutro,
  recomendado: styles.puntoRecomendado,
  incompleto: styles.puntoIncompleto,
};

function formatearFecha(): string {
  const texto = new Intl.DateTimeFormat("es-CL", {
    weekday: "long",
    day: "numeric",
    month: "long",
  }).format(new Date());
  return texto.charAt(0).toUpperCase() + texto.slice(1);
}

export default function HomePage() {
  // undefined = todavía no se revisó localStorage; null = no vinculado.
  const [vinculo, setVinculo] = useState<Vinculo | null | undefined>(undefined);
  const [fecha, setFecha] = useState("");
  const [historial, setHistorial] = useState<EntradaHistorial[]>([]);
  const [reglas, setReglas] = useState<Regla[] | null>(null);

  useEffect(() => {
    // localStorage y la fecha local no existen/coinciden durante el render
    // en el servidor; no hay forma de derivar esto en el render.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setFecha(formatearFecha());
    setHistorial(leerHistorial());

    const guardado = localStorage.getItem(STORAGE_KEY);
    if (!guardado) {
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

    // Las reglas se piden para recalcular el color de cada ítem del historial.
    // Si fallan, el historial se muestra igual pero sin punto de color: ver el
    // comentario de `conVeredicto` más abajo.
    let activo = true;
    fetch(`/api/pacientes/${encodeURIComponent(parseado.pacienteId)}/reglas`)
      .then(async (res): Promise<{ reglas?: unknown }> => {
        if (!res.ok) throw new Error(`reglas: HTTP ${res.status}`);
        return res.json();
      })
      .then((data) => {
        if (activo && Array.isArray(data.reglas)) setReglas(data.reglas as Regla[]);
      })
      .catch(() => {
        /* reglas queda en null: el historial se muestra sin color. */
      });

    return () => {
      activo = false;
    };
  }, []);

  /**
   * El veredicto de cada ítem se calcula acá, en cada render, contra las reglas
   * vigentes — nunca se guarda con el producto. Si las reglas no cargaron,
   * `veredicto` queda null y el ítem se muestra sin punto de color: mejor un
   * historial sin color que uno con colores que podrían estar desactualizados.
   */
  const conVeredicto = useMemo(
    () =>
      historial.map((entrada) => ({
        ...entrada,
        veredicto: reglas
          ? calcularVeredicto(entrada.producto, entrada.origen, reglas)
          : null,
      })),
    [historial, reglas],
  );

  const primerNombre = vinculo?.pacienteNombre?.split(" ")[0];
  const inicial = primerNombre?.charAt(0).toUpperCase();

  return (
    <div className={styles.pagina}>
      <header className={styles.navSuperior}>
        <div className={styles.marca}>
          {/* eslint-disable-next-line @next/next/no-img-element -- images.unoptimized:true (next.config.ts) hace que next/image no aporte nada acá */}
          <img src="/logo.png" alt="" className={styles.logo} />
          <span className={styles.nombreMarca}>Apto</span>
        </div>
        <Link href="/perfil" className={styles.avatar} aria-label="Mi perfil">
          {inicial ?? <IconoPersona size={20} />}
        </Link>
      </header>

      <p className={styles.fecha}>{fecha}</p>
      <h1 className={styles.saludo}>{primerNombre ? `Hola, ${primerNombre}` : "Hola"} 👋</h1>
      <p className={styles.subtitulo}>¿Listo para revisar un producto?</p>

      {vinculo === null && (
        <Link href="/vinculacion" className={styles.tarjetaSinVincular}>
          <div className={styles.iconoVinculo} aria-hidden="true">
            <IconoEnlace size={22} />
          </div>
          <div className={styles.infoSinVincular}>
            <p className={styles.tituloSinVincular}>Conecta con tu nutricionista</p>
            <p className={styles.textoSinVincular}>Recibe recomendaciones personalizadas</p>
          </div>
          <span className={styles.botonConectar}>Conectar</span>
        </Link>
      )}

      {vinculo && (
        <Link href="/perfil" className={styles.tarjetaConectado}>
          <div className={styles.avatarNutri} aria-hidden="true">
            <IconoPersona size={24} />
          </div>
          <div className={styles.infoConectado}>
            <p className={styles.estadoConectado}>
              <span className={styles.puntoConectado} aria-hidden="true" />
              CONECTADO
            </p>
            <p className={styles.nombreNutri}>
              {vinculo.nutricionistaNombre ?? "Tu nutricionista"}
            </p>
            <p className={styles.rolNutri}>Nutricionista</p>
          </div>
          <span className={styles.flecha} aria-hidden="true">
            ›
          </span>
        </Link>
      )}

      {/* El centro de la pantalla ya no es el botón de escanear: esa acción vive
          en la barra inferior, y tenerla dos veces era redundante. Acá va lo
          escaneado recientemente, o —la primera vez— cómo funciona la app. */}
      {conVeredicto.length > 0 ? (
        <>
          <div className={styles.historialEncabezado}>
            <h2 className={styles.historialTitulo}>Escaneos recientes</h2>
            <span className={styles.historialConteo}>
              {conVeredicto.length === 1 ? "1 producto" : `${conVeredicto.length} productos`}
            </span>
          </div>

          <div className={styles.historial}>
            {conVeredicto.map(({ producto, veredicto, visto }) => (
              <Link
                key={producto.codigo_barras}
                href={`/producto/${encodeURIComponent(producto.codigo_barras)}`}
                className={styles.historialItem}
              >
                {veredicto && (
                  <span
                    className={`${styles.punto} ${CLASE_PUNTO[veredicto.estado]}`}
                    aria-hidden="true"
                  />
                )}
                <span className={styles.historialInfo}>
                  <span className={styles.historialNombre}>
                    {producto.nombre ?? "Producto sin nombre"}
                  </span>
                  {producto.marca && (
                    <span className={styles.historialMarca}>{producto.marca}</span>
                  )}
                </span>
                <span className={styles.historialCuando}>{haceCuanto(visto)}</span>
                <span className={styles.historialFlecha} aria-hidden="true">
                  ›
                </span>
              </Link>
            ))}
          </div>
        </>
      ) : (
        <div className={styles.comoFunciona}>
          <h2 className={styles.comoFuncionaTitulo}>Cómo funciona</h2>
          <div className={styles.comoFuncionaCuerpo}>
            <div className={styles.paso}>
              <span className={styles.pasoNumero} aria-hidden="true">
                1
              </span>
              <span className={styles.pasoTexto}>
                <span className={styles.pasoTitulo}>Conéctate con tu nutricionista</span>
                <span className={styles.pasoDetalle}>
                  Con el código de 4 caracteres que te dio
                </span>
              </span>
            </div>
            <div className={styles.paso}>
              <span className={styles.pasoNumero} aria-hidden="true">
                2
              </span>
              <span className={styles.pasoTexto}>
                <span className={styles.pasoTitulo}>Escanea el código de barras</span>
                <span className={styles.pasoDetalle}>Con el botón ámbar de aquí abajo</span>
              </span>
            </div>
            <div className={styles.paso}>
              <span className={styles.pasoNumero} aria-hidden="true">
                3
              </span>
              <span className={styles.pasoTexto}>
                <span className={styles.pasoTitulo}>Mira si es apto para ti</span>
                <span className={styles.pasoDetalle}>
                  Rojo, neutro o verde, según tus reglas
                </span>
              </span>
            </div>
            <p className={styles.comoFuncionaNota}>
              <IconoInfo size={17} />
              Aquí van a aparecer tus escaneos recientes
            </p>
          </div>
        </div>
      )}

      <Link href="/nutricionista" className={styles.enlaceNutricionista}>
        ¿Eres nutricionista? Ingresa aquí
      </Link>
    </div>
  );
}
