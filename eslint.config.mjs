import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Sobreescribe los ignores por defecto de eslint-config-next, así que hay
  // que repetirlos.
  globalIgnores([
    // Defaults de eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // Propios: archivos generados, no los escribimos nosotros.
    ".open-next/**",
    "cloudflare-env.d.ts",
  ]),
]);

export default eslintConfig;
