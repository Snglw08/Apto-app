/**
 * Set de íconos de línea (trazo, sin relleno salvo detalles puntuales) que
 * reemplaza el uso de emoji en toda la app. Todos heredan el color vía
 * currentColor — el tamaño y color se controlan desde afuera con className.
 */

type IconoProps = {
  className?: string;
  size?: number;
};

const BASE = {
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.6,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
  "aria-hidden": true,
};

/**
 * Escaneo de código de barras: marco de esquinas con las barras adentro.
 * Distinto de IconoCamara a propósito — la cámara es el dispositivo, esto es
 * la acción. En la pantalla de inicio el usuario no quiere "abrir la cámara",
 * quiere escanear un producto.
 */
export function IconoEscanear({ className, size = 24 }: IconoProps) {
  return (
    <svg {...BASE} width={size} height={size} className={className}>
      {/* Las cuatro esquinas del visor */}
      <path d="M4 8.5V6.5A2.5 2.5 0 0 1 6.5 4h2" />
      <path d="M15.5 4h2A2.5 2.5 0 0 1 20 6.5v2" />
      <path d="M20 15.5v2a2.5 2.5 0 0 1-2.5 2.5h-2" />
      <path d="M8.5 20h-2A2.5 2.5 0 0 1 4 17.5v-2" />
      {/* Las barras del código */}
      <path d="M8 8.75v6.5" />
      <path d="M11 8.75v6.5" />
      <path d="M13.5 8.75v6.5" />
      <path d="M16 8.75v6.5" />
    </svg>
  );
}

/** Avatar genérico (paciente, nutricionista o perfil sin foto). */
export function IconoPersona({ className, size = 24 }: IconoProps) {
  return (
    <svg {...BASE} width={size} height={size} className={className}>
      <circle cx="12" cy="8.5" r="3.2" />
      <path d="M5.5 19c1-3.2 3.6-5 6.5-5s5.5 1.8 6.5 5" />
    </svg>
  );
}

export function IconoCamara({ className, size = 24 }: IconoProps) {
  return (
    <svg {...BASE} width={size} height={size} className={className}>
      <path d="M4 8.5A1.5 1.5 0 0 1 5.5 7H8l1-1.5h6L16 7h2.5A1.5 1.5 0 0 1 20 8.5v9A1.5 1.5 0 0 1 18.5 19h-13A1.5 1.5 0 0 1 4 17.5v-9Z" />
      <circle cx="12" cy="13" r="3.2" />
    </svg>
  );
}

/** Vínculo/conexión paciente-nutricionista. */
export function IconoEnlace({ className, size = 24 }: IconoProps) {
  return (
    <svg {...BASE} width={size} height={size} className={className}>
      <rect x="2.5" y="9.5" width="9" height="5" rx="2.5" transform="rotate(-45 7 12)" />
      <rect x="12.5" y="9.5" width="9" height="5" rx="2.5" transform="rotate(-45 17 12)" />
    </svg>
  );
}

export function IconoAdvertencia({ className, size = 24 }: IconoProps) {
  return (
    <svg {...BASE} width={size} height={size} className={className}>
      <path d="M12 4.5 20.5 19h-17L12 4.5Z" />
      <path d="M12 10v3.5" />
      <circle cx="12" cy="16.3" r="0.9" fill="currentColor" stroke="none" />
    </svg>
  );
}

export function IconoCandado({ className, size = 24 }: IconoProps) {
  return (
    <svg {...BASE} width={size} height={size} className={className}>
      <rect x="5.5" y="11" width="13" height="9" rx="2.5" />
      <path d="M8.5 11V8a3.5 3.5 0 0 1 7 0v3" />
    </svg>
  );
}

export function IconoLupa({ className, size = 24 }: IconoProps) {
  return (
    <svg {...BASE} width={size} height={size} className={className}>
      <circle cx="10.5" cy="10.5" r="6" />
      <path d="M15 15 20 20" />
    </svg>
  );
}

/** Funcionalidad todavía no disponible ("próximamente"). */
export function IconoNotas({ className, size = 24 }: IconoProps) {
  return (
    <svg {...BASE} width={size} height={size} className={className}>
      <path d="M6 4.5h9l3 3V19.5A1.5 1.5 0 0 1 16.5 21h-9A1.5 1.5 0 0 1 6 19.5V4.5Z" />
      <path d="M14.5 4.5V8h3.5" />
      <path d="M9 12h6M9 15.5h6" />
    </svg>
  );
}

/** Producto no encontrado. */
export function IconoCaja({ className, size = 24 }: IconoProps) {
  return (
    <svg {...BASE} width={size} height={size} className={className}>
      <path d="M4 8.5 12 4l8 4.5-8 4.5-8-4.5Z" />
      <path d="M4 8.5V16l8 4.5 8-4.5V8.5" />
      <path d="M12 13v7.5" />
    </svg>
  );
}

/** Datos incompletos / info. */
export function IconoInfo({ className, size = 24 }: IconoProps) {
  return (
    <svg {...BASE} width={size} height={size} className={className}>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M12 11v5.5" />
      <circle cx="12" cy="8" r="0.9" fill="currentColor" stroke="none" />
    </svg>
  );
}

export function IconoCheck({ className, size = 24 }: IconoProps) {
  return (
    <svg {...BASE} width={size} height={size} className={className}>
      <path d="M5 12.5 9.5 17 19 7" />
    </svg>
  );
}

export function IconoX({ className, size = 24 }: IconoProps) {
  return (
    <svg {...BASE} width={size} height={size} className={className}>
      <path d="M6 6l12 12M18 6 6 18" />
    </svg>
  );
}

/** Botón "Compartir" de Safari/iOS, para instrucciones de instalación. */
export function IconoCompartir({ className, size = 24 }: IconoProps) {
  return (
    <svg {...BASE} width={size} height={size} className={className}>
      <path d="M12 14V3" />
      <path d="M8 7l4-4 4 4" />
      <path d="M6 10v8a2 2 0 0 0 2 2h8a2 2 0 0 0 2-2v-8" />
    </svg>
  );
}

export function IconoInicio({ className, size = 24 }: IconoProps) {
  return (
    <svg {...BASE} width={size} height={size} className={className}>
      <path d="M4 11.5 12 4l8 7.5" />
      <path d="M6 10v9a1 1 0 0 0 1 1h10a1 1 0 0 0 1-1v-9" />
      <path d="M10 20v-5h4v5" />
    </svg>
  );
}

/** Instalar la app (descarga/agregar). */
export function IconoInstalar({ className, size = 24 }: IconoProps) {
  return (
    <svg {...BASE} width={size} height={size} className={className}>
      <path d="M12 4v11" />
      <path d="M8 11l4 4 4-4" />
      <path d="M5 17v2a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-2" />
    </svg>
  );
}
