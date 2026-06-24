import path from "path"
import tailwindcss from "@tailwindcss/vite"
import react from "@vitejs/plugin-react"
import { defineConfig } from "vitest/config"

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
      "@workflow-next-matrix": path.resolve(
        __dirname,
        "../server/src/workflow/workflow-node-next-matrix.ts",
      ),
    },
  },
  test: {
    environment: "node",
    include: ["src/**/*.spec.ts"],
  },
})
