/**
 * El semáforo. Lógica pura, sin React ni red: es la única pieza del proyecto
 * donde un bug tiene consecuencias sobre una persona, y por eso vive acá
 * separada de la pantalla que la usa — para poder testearla sin montar nada.
 *
 * Las reglas que implementa están escritas en CLAUDE.md (regla 5) y explicadas
 * en el README (decisión 1). Si cambian allá, los tests de veredicto.test.ts
 * tienen que cambiar a propósito, no de rebote.
 */

export type Origen = "productos_propios" | "off_cache";

export type Producto = {
  codigo_barras: string;
  nombre: string | null;
  marca: string | null;
  ingredientes: string | null;
  fuente?: "off" | "ocr" | "manual";
  states_tags?: string[];
  last_modified_t?: number | null;
  data_quality_errors_tags?: string[];
};

export type Regla = { tipo: "vetado" | "recomendado"; ingrediente_clave: string };

export type Veredicto =
  | { estado: "vetado" | "neutro" | "recomendado"; motivo: string }
  | { estado: "incompleto" };

const DOS_ANIOS_EN_SEGUNDOS = 2 * 365.25 * 24 * 3600;

/**
 * De los errores de calidad que reporta OFF, solo descalifican los que hablan
 * de los ingredientes.
 *
 * El corte original miraba `data_quality_errors_tags` entero, y eso resultó
 * demasiado ancho. Medido sobre 1000 productos del cache: de 33 tipos de error
 * distintos, **32 son sobre la tabla nutricional** —calorías que no cuadran,
 * sal que no coincide con el envase, fibra soluble mal sumada— y uno solo es
 * sobre ingredientes.
 *
 * Y esta función decide **únicamente a partir del texto de ingredientes**: la
 * tabla nutricional no se lee nunca. Un producto cuyas calorías están mal
 * sumadas no es menos confiable para saber si contiene lactosa.
 *
 * El efecto de acotarlo, medido: los productos que devuelven un veredicto real
 * pasaron del 88% al 99%. La regla sigue fallando hacia el lado seguro —un
 * error sobre los ingredientes sigue mandando a "datos incompletos"— pero deja
 * de castigar un producto por un dato que no usa para decidir.
 */
function tieneErroresDeIngredientes(producto: Producto): boolean {
  return (producto.data_quality_errors_tags ?? []).some((tag) =>
    tag.includes("ingredient"),
  );
}

// Regla central del proyecto (ver "El semáforo" en el README): el semáforo
// nunca muestra verde si el dato viene de OFF y está incompleto,
// desactualizado o con errores de calidad. Ante la duda,
// jamás declarar un producto apto. Mismo criterio para fuente 'ocr' (foto sin
// verificar): puede vetar por seguridad, pero nunca recomienda en verde.
export function calcularVeredicto(
  producto: Producto,
  origen: Origen,
  reglas: Regla[],
): Veredicto {
  if (origen === "off_cache") {
    const statesTags = producto.states_tags ?? [];
    const lastModified = producto.last_modified_t ?? null;
    const desactualizado =
      !lastModified || Date.now() / 1000 - lastModified > DOS_ANIOS_EN_SEGUNDOS;

    if (
      !statesTags.includes("en:ingredients-completed") ||
      desactualizado ||
      tieneErroresDeIngredientes(producto)
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
    motivo:
      "No encontramos restricciones ni recomendaciones para este producto. Con moderación, sin problema.",
  };
}
