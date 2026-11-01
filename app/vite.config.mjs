import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { viteSingleFile } from "vite-plugin-singlefile";
import { readFileSync } from "fs";

// v3.37.3: la versión sale SOLO de package.json (antes estaba repetida en base.jsx y, si no se cambiaban las dos,
// la app creía ser más vieja y pedía actualizar sin parar)
const VERSION = JSON.parse(readFileSync(new URL("./package.json", import.meta.url), "utf8")).version;

// Un único index.html autocontenido: sirve igual para GitHub Pages (móvil)
// y para Electron (escritorio), sin CDNs ni compilación en el navegador.
export default defineConfig({
  base: "./",
  define: { __APP_VERSION__: JSON.stringify(VERSION) },
  plugins: [react(), viteSingleFile()],
  build: {
    target: "es2019",
    chunkSizeWarningLimit: 4000
  }
});
