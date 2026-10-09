// Desde Prisma 7 la CLI ya no carga el .env por su cuenta: hay que hacerlo aquí.
import "dotenv/config"
import { defineConfig } from "prisma/config"

// Las migraciones necesitan una conexión directa, sin pooler. Si solo está
// definida la URL con pooling, se usa esa.
//
// Se lee de process.env y no con el env() de Prisma, que lanza si la variable
// falta: `prisma generate` corre en el postinstall, donde puede no haber base
// de datos configurada todavía, y no la necesita.
const url = process.env.POSTGRES_URL_NON_POOLING || process.env.POSTGRES_PRISMA_URL

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
    seed: "tsx prisma/seed.ts",
  },
  ...(url ? { datasource: { url } } : {}),
})
