import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { loadEnvFile } from "./scripts/fs-utils";
import { applyLocalKeysToProcessEnv } from "./scripts/local-keys";

loadEnvFile();
applyLocalKeysToProcessEnv();

export default defineConfig({
  plugins: [react()],
  define: {
    __TENCENT_MAP_WEB_KEY__: JSON.stringify(process.env.VITE_TENCENT_MAP_WEB_KEY ?? "")
  },
  server: {
    host: "127.0.0.1",
    port: 5173
  },
  preview: {
    host: "127.0.0.1",
    port: 4173
  }
});
