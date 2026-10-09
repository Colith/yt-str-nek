import { fileURLToPath } from "node:url"
import { defineConfig } from "vitest/config"

const root = fileURLToPath(new URL(".", import.meta.url))
const alias = { "@": root.replace(/[\/]$/, "") }

export default defineConfig({
  resolve: { alias },
  test: {
    // Dos entornos: el servidor (librerías, rutas de API y páginas) corre en
    // Node contra un Postgres en memoria; la interfaz corre en jsdom.
    projects: [
      {
        resolve: { alias },
        test: {
          name: "server",
          environment: "node",
          include: ["tests/server/**/*.test.ts", "tests/server/**/*.test.tsx"],
          setupFiles: ["tests/helpers/setup-server.ts"],
          // Arrancar Postgres en memoria y aplicar las migraciones lleva un rato
          testTimeout: 20000,
          hookTimeout: 60000,
        },
      },
      {
        resolve: { alias },
        test: {
          name: "ui",
          environment: "jsdom",
          include: ["tests/ui/**/*.test.tsx", "tests/ui/**/*.test.ts"],
          setupFiles: ["tests/helpers/setup-ui.ts"],
        },
      },
    ],
    coverage: {
      provider: "v8",
      reporter: ["text", "html"],
      include: [
        "app/**/*.{ts,tsx}",
        "components/**/*.{ts,tsx}",
        "hooks/**/*.ts",
        "lib/**/*.ts",
        "proxy.ts",
      ],
      exclude: [
        // Código generado o de terceros, no de la aplicación
        "lib/generated/**",
        "components/ui/**",
      ],
    },
  },
})
