import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

// Config mínima a propósito. Los tests de este repo cubren lógica pura
// (lib/veredicto.ts): corren en Node, sin jsdom, sin tocar el runtime de
// Workers ni la base. Si algún día se testea un componente o una ruta, eso
// necesita su propio entorno y conviene decidirlo entonces, no ahora.
export default defineConfig({
  resolve: {
    // Mismo alias que tsconfig.json ("@/*": ["./*"]), para que un import
    // funcione igual en el test que en la app.
    alias: { "@": fileURLToPath(new URL("./", import.meta.url)) },
  },
  test: {
    include: ["lib/**/*.test.ts"],
    environment: "node",
  },
});
