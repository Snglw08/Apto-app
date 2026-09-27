import { describe, expect, it } from "vitest";
import { calcularVeredicto, type Producto, type Regla } from "@/lib/veredicto";

/**
 * Estos tests son la regla 5 de CLAUDE.md escrita en código, más la decisión 1
 * del README. No están acá para subir un número de cobertura: están porque un
 * falso "recomendado" a un paciente celíaco es un daño real y un falso "no sé"
 * es una molestia, y el sistema tiene que estar sesgado hacia el segundo error.
 *
 * Si alguna de estas reglas cambia, el test correspondiente tiene que cambiar
 * a propósito y con la justificación en el commit — no romperse de rebote.
 */

const AHORA = Math.floor(Date.now() / 1000);
const HACE_UN_DIA = AHORA - 86400;
const HACE_TRES_ANIOS = AHORA - 3 * 365 * 86400;

/** Producto de OFF que pasa los cuatro cortes de calidad: el caso "sano". */
function productoOff(extra: Partial<Producto> = {}): Producto {
  return {
    codigo_barras: "7802900000001",
    nombre: "Leche entera 1 L",
    marca: "Marca Demo",
    ingredientes: "Leche entera, lactosa, vitamina D.",
    fuente: "off",
    states_tags: ["en:ingredients-completed"],
    last_modified_t: HACE_UN_DIA,
    data_quality_errors_tags: [],
    ...extra,
  };
}

const VETA_LACTOSA: Regla = { tipo: "vetado", ingrediente_clave: "lactosa" };
const PREFIERE_AVENA: Regla = { tipo: "recomendado", ingrediente_clave: "avena" };

describe("datos de Open Food Facts que no habilitan el verde", () => {
  it("es incompleto si states_tags no incluye en:ingredients-completed", () => {
    const producto = productoOff({ states_tags: ["en:ingredients-to-be-completed"] });
    expect(calcularVeredicto(producto, "off_cache", [PREFIERE_AVENA])).toEqual({
      estado: "incompleto",
    });
  });

  it("es incompleto si el dato tiene más de 2 años", () => {
    const producto = productoOff({ last_modified_t: HACE_TRES_ANIOS });
    expect(calcularVeredicto(producto, "off_cache", [])).toEqual({ estado: "incompleto" });
  });

  it("es incompleto si no se sabe cuándo se modificó (last_modified_t nulo)", () => {
    // Ausencia de fecha se trata como dato viejo, no como dato fresco: es la
    // dirección segura del error.
    const producto = productoOff({ last_modified_t: null });
    expect(calcularVeredicto(producto, "off_cache", [])).toEqual({ estado: "incompleto" });
  });

  it("es incompleto si OFF reporta un error de calidad SOBRE LOS INGREDIENTES", () => {
    const producto = productoOff({
      data_quality_errors_tags: [
        "en:ingredients-single-ingredient-from-category-does-not-match-actual-ingredients",
      ],
    });
    expect(calcularVeredicto(producto, "off_cache", [])).toEqual({ estado: "incompleto" });
  });

  it("pero un error sobre la tabla nutricional NO descalifica", () => {
    // El veredicto se calcula únicamente con el texto de ingredientes: la tabla
    // nutricional no se lee nunca. Que las calorías de un producto estén mal
    // sumadas no lo vuelve menos confiable para saber si contiene lactosa.
    //
    // Este caso existe porque el corte original miraba data_quality_errors_tags
    // entero y resultó demasiado ancho: medido sobre 1000 productos del cache,
    // 32 de los 33 tipos de error son sobre nutrición. Acotarlo llevó los
    // productos con veredicto real del 88% al 99%.
    const producto = productoOff({
      ingredientes: "Leche entera, lactosa.",
      data_quality_errors_tags: [
        "en:nutrition-packaging-as-sold-100g-energy-value-in-kcal-does-not-match-value-computed",
      ],
    });
    expect(calcularVeredicto(producto, "off_cache", [VETA_LACTOSA]).estado).toBe("vetado");
  });

  it("recién con los cuatro cortes pasados puede llegar a recomendado", () => {
    const avena = productoOff({ ingredientes: "Avena integral, agua, sal marina." });
    expect(calcularVeredicto(avena, "off_cache", [PREFIERE_AVENA]).estado).toBe("recomendado");
  });

  it("no aplica los cortes de calidad a productos_propios (no vienen de OFF)", () => {
    // Un producto propio no tiene states_tags ni last_modified_t, y eso no
    // puede dejarlo permanentemente en "incompleto".
    const propio: Producto = {
      codigo_barras: "7802900000002",
      nombre: "Avena a granel",
      marca: null,
      ingredientes: "Avena integral.",
      fuente: "manual",
    };
    expect(calcularVeredicto(propio, "productos_propios", [PREFIERE_AVENA]).estado).toBe(
      "recomendado",
    );
  });
});

describe("sin ingredientes no hay veredicto", () => {
  it("es incompleto si el texto de ingredientes está vacío", () => {
    const producto = productoOff({ ingredientes: "" });
    expect(calcularVeredicto(producto, "off_cache", [VETA_LACTOSA])).toEqual({
      estado: "incompleto",
    });
  });

  it("es incompleto si el texto de ingredientes es nulo", () => {
    const producto = productoOff({ ingredientes: null });
    expect(calcularVeredicto(producto, "off_cache", [VETA_LACTOSA])).toEqual({
      estado: "incompleto",
    });
  });

  it("es incompleto si el texto son solo espacios en blanco", () => {
    const producto = productoOff({ ingredientes: "   \n\t  " });
    expect(calcularVeredicto(producto, "off_cache", [VETA_LACTOSA])).toEqual({
      estado: "incompleto",
    });
  });
});

describe("ante conflicto, vetado gana", () => {
  it("un producto que matchea vetado y recomendado a la vez sale vetado", () => {
    const producto = productoOff({ ingredientes: "Avena, leche, lactosa." });
    const veredicto = calcularVeredicto(producto, "off_cache", [VETA_LACTOSA, PREFIERE_AVENA]);
    expect(veredicto.estado).toBe("vetado");
  });

  it("el motivo del vetado nombra todos los ingredientes vetados que matchearon", () => {
    const producto = productoOff({ ingredientes: "Leche, lactosa, suero de leche." });
    const veredicto = calcularVeredicto(producto, "off_cache", [
      VETA_LACTOSA,
      { tipo: "vetado", ingrediente_clave: "suero de leche" },
    ]);
    if (veredicto.estado === "incompleto") throw new Error("se esperaba un veredicto");
    expect(veredicto.motivo).toContain("lactosa");
    expect(veredicto.motivo).toContain("suero de leche");
  });
});

describe("un dato sin verificar nunca habilita el verde", () => {
  it("fuente ocr con match recomendado sale neutro, no recomendado", () => {
    const porFoto: Producto = {
      codigo_barras: "7802900000003",
      nombre: "Bebida de avena",
      marca: null,
      ingredientes: "Agua, avena integral.",
      fuente: "ocr",
    };
    const veredicto = calcularVeredicto(porFoto, "productos_propios", [PREFIERE_AVENA]);
    expect(veredicto.estado).toBe("neutro");
  });

  it("pero fuente ocr SÍ puede vetar: ante la duda se avisa igual", () => {
    const porFoto: Producto = {
      codigo_barras: "7802900000004",
      nombre: "Postre",
      marca: null,
      ingredientes: "Azúcar, lactosa, almidón.",
      fuente: "ocr",
    };
    expect(calcularVeredicto(porFoto, "productos_propios", [VETA_LACTOSA]).estado).toBe("vetado");
  });

  it("fuente manual sí puede recomendar: el contrato solo restringe off y ocr", () => {
    const manual: Producto = {
      codigo_barras: "7802900000005",
      nombre: "Avena a granel",
      marca: null,
      ingredientes: "Avena integral.",
      fuente: "manual",
    };
    expect(calcularVeredicto(manual, "productos_propios", [PREFIERE_AVENA]).estado).toBe(
      "recomendado",
    );
  });
});

describe("el match de ingredientes", () => {
  it("ignora mayúsculas en el texto del producto", () => {
    const producto = productoOff({ ingredientes: "LECHE ENTERA, LACTOSA." });
    expect(calcularVeredicto(producto, "off_cache", [VETA_LACTOSA]).estado).toBe("vetado");
  });

  it("ignora mayúsculas en el ingrediente de la regla", () => {
    const producto = productoOff({ ingredientes: "Leche entera, lactosa." });
    const regla: Regla = { tipo: "vetado", ingrediente_clave: "LACTOSA" };
    expect(calcularVeredicto(producto, "off_cache", [regla]).estado).toBe("vetado");
  });

  it("sin reglas que matcheen, el veredicto es neutro", () => {
    const producto = productoOff({ ingredientes: "Agua, gas carbónico." });
    expect(calcularVeredicto(producto, "off_cache", [VETA_LACTOSA, PREFIERE_AVENA]).estado).toBe(
      "neutro",
    );
  });

  it("con cero reglas el veredicto es neutro — y por eso la ausencia de reglas y un fallo al cargarlas no pueden confundirse", () => {
    // Este test documenta el porqué del estado "error" en las pantallas que
    // consumen esta función: con [] el resultado es un neutro tranquilizador
    // ("con moderación, sin problema"), así que un endpoint caído jamás puede
    // llegar acá disfrazado de lista vacía. Ver app/producto/[codigo_barras]
    // y app/perfil.
    const producto = productoOff();
    const veredicto = calcularVeredicto(producto, "off_cache", []);
    expect(veredicto.estado).toBe("neutro");
    if (veredicto.estado === "incompleto") throw new Error("se esperaba un veredicto");
    expect(veredicto.motivo).toContain("Con moderación");
  });
});

describe("el match por substring, tal como está hoy", () => {
  it("matchea de más: 'sal' encuentra 'salvado'", () => {
    // Limitación conocida y documentada en el README. Este test NO la celebra:
    // la fija, para que el día que se normalice el match (límites de palabra,
    // acentos, o allergens_tags de OFF) el cambio se vea acá como una
    // expectativa que hay que invertir a propósito.
    const producto = productoOff({ ingredientes: "Harina de trigo, salvado, agua." });
    const vetaSal: Regla = { tipo: "vetado", ingrediente_clave: "sal" };
    expect(calcularVeredicto(producto, "off_cache", [vetaSal]).estado).toBe("vetado");
  });
});
