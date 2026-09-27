import type { Metadata } from "next";
import { Geist } from "next/font/google";
import BarraInferior from "./BarraInferior";
import ChunkErrorHandler from "./chunk-error-handler";
import InstalarApp from "./InstalarApp";
import "./globals.css";

// Se expone como --font-sans (no como --font-geist) para que cambiar de
// tipografía sea editar solo este archivo: globals.css consume el token.
const geist = Geist({
  variable: "--font-sans",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700", "800"],
});

export const metadata: Metadata = {
  title: "Apto",
  description: "Escanea un producto y mira si es compatible con tus reglas.",
  appleWebApp: {
    capable: true,
    title: "Apto",
    statusBarStyle: "default",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="es" className={geist.variable}>
      <body>
        <ChunkErrorHandler />
        {children}
        <BarraInferior />
        <InstalarApp />
      </body>
    </html>
  );
}
