import { getSupabaseClient } from "@/lib/supabase/server";
import TablaProductos from "./TablaProductos";
import styles from "./page.module.css";

// Tablero de uso interno para seguir el avance de la precarga manual de
// productos_propios. Deliberadamente aislado del resto de la app: no importa
// componentes ni estilos de otras rutas y no se enlaza desde ninguna pantalla.
// Nació de una necesidad concreta de campo — revisar el conteo desde el
// celular, en el supermercado, sin abrir el dashboard de Supabase.
//
// Sin caché: cada visita debe reflejar la base tal cual está en ese momento,
// a diferencia del resto de la app, que sí puede cachear.
export const dynamic = "force-dynamic";
export const revalidate = 0;

// No indexar ni seguir enlaces. No lleva autenticación porque no expone nada
// que no sea ya público: productos_propios tiene una policy de RLS de lectura
// pública (es el catálogo que la app muestra a cualquier visitante). Si algún
// día mostrara datos del circuito clínico, esto necesita auth antes que nada.
export const metadata = {
  robots: { index: false, follow: false },
};

const META_MINIMA = 100;
const META_MAXIMA = 150;

export default async function ProductosInternoPage() {
  const supabase = getSupabaseClient();

  const { data: productos, error } = await supabase
    .from("productos_propios")
    .select("codigo_barras, nombre, marca, fuente, fecha_dato")
    .order("fecha_dato", { ascending: false });

  const lista = productos ?? [];
  const manuales = lista.filter((p) => p.fuente === "manual").length;
  const ocr = lista.filter((p) => p.fuente === "ocr").length;
  const pct = Math.min(100, (manuales / META_MAXIMA) * 100);

  return (
    <div className={styles.pagina}>
      <div className={styles.envoltorio}>
        <header className={styles.encabezado}>
          <span className={styles.eyebrow}>Apto · uso interno</span>
          <h1 className={styles.titulo}>Carga de productos en productos_propios</h1>
          <p className={styles.subtitulo}>
            Vista en vivo, directo de la base de datos. No es parte de la app pública.
          </p>
        </header>

        {error ? (
          <p className={styles.error}>No pudimos consultar productos_propios: {error.message}</p>
        ) : (
          <>
            <section className={styles.resumen}>
              <div className={styles.cifra}>
                <span className={styles.cifraNumero}>{manuales}</span>
                <span className={styles.cifraMeta}>/ {META_MAXIMA} manuales</span>
              </div>

              <div className={styles.barraFila}>
                <div className={styles.barraEtiquetas}>
                  <span>{manuales} cargados</span>
                  <span>
                    meta {META_MINIMA}–{META_MAXIMA}
                  </span>
                </div>
                <div className={styles.barra}>
                  <div className={styles.barraRelleno} style={{ width: `${pct}%` }} />
                  <div
                    className={styles.barraMarca}
                    style={{ left: `${(META_MINIMA / META_MAXIMA) * 100}%` }}
                  />
                </div>
              </div>

              <div className={styles.chips}>
                <span className={`${styles.chip} ${styles.chipManual}`}>
                  <span className={styles.punto} /> {manuales} manuales
                </span>
                <span className={`${styles.chip} ${styles.chipOcr}`}>
                  <span className={styles.punto} /> {ocr} por foto (OCR)
                </span>
                <span className={styles.chip}>{lista.length} filas en total</span>
              </div>
            </section>

            <TablaProductos productos={lista} />
          </>
        )}
      </div>
    </div>
  );
}
