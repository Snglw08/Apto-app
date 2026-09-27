"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useIrAEscanear } from "./escanear/ir-a-escanear";
import { IconoEnlace, IconoEscanear, IconoPersona } from "./icons";
import styles from "./page.module.css";

const STORAGE_KEY = "apto-vinculacion";

type Vinculo = {
  pacienteId: string;
  pacienteNombre: string;
  nutricionistaNombre: string | null;
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
  const irAEscanear = useIrAEscanear();
  // undefined = todavía no se revisó localStorage; null = no vinculado.
  const [vinculo, setVinculo] = useState<Vinculo | null | undefined>(undefined);
  const [fecha, setFecha] = useState("");

  useEffect(() => {
    // localStorage y la fecha local no existen/coinciden durante el render
    // en el servidor; no hay forma de derivar esto en el render.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setFecha(formatearFecha());

    const guardado = localStorage.getItem(STORAGE_KEY);
    if (!guardado) {
      setVinculo(null);
      return;
    }
    try {
      setVinculo(JSON.parse(guardado) as Vinculo);
    } catch {
      setVinculo(null);
    }
  }, []);

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

      {/* El símbolo ES el botón: un solo objetivo táctil grande, con la etiqueta
          debajo. Antes el icono aparecía dos veces —el logo grande arriba y otro
          chico dentro de un botón ámbar— y ninguno de los dos era protagonista.
          La marca ya está en la cabecera, así que acá el logo no aportaba. */}
      <div className={styles.tarjetaEscanear}>
        <Link href="/escanear" className={styles.accionEscanear} onClick={irAEscanear}>
          <span className={styles.simboloEscanear} aria-hidden="true">
            <IconoEscanear size={56} />
          </span>
          <span className={styles.etiquetaEscanear}>Escanear</span>
        </Link>
        <p className={styles.subtituloEscanear}>
          Apunta al código de barras para comprobar si es compatible con tu plan
        </p>
      </div>

      <Link href="/nutricionista" className={styles.enlaceNutricionista}>
        ¿Eres nutricionista? Ingresa aquí
      </Link>
    </div>
  );
}
