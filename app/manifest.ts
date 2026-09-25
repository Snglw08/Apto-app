import type { MetadataRoute } from "next";

// Manifest de la PWA. Los colores repiten valores de globals.css a mano porque
// esto se sirve como JSON, no como CSS, y no puede leer variables.
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Apto — escáner de etiquetas",
    short_name: "Apto",
    description: "Escanea un producto y mira si es compatible con tus reglas.",
    start_url: "/",
    display: "standalone",
    background_color: "#f4f5f7",
    theme_color: "#1b3a6b",
    icons: [
      { src: "/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
