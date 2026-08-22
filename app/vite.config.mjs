import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { viteSingleFile } from "vite-plugin-singlefile";

// Un único index.html autocontenido: sirve igual para GitHub Pages (móvil)
// y para Electron (escritorio), sin CDNs ni compilación en el navegador.
export default defineConfig({
  base: "./",
  plugins: [react(), viteSingleFile()],
  build: {
    target: "es2019",
    chunkSizeWarningLimit: 4000
  }
});
