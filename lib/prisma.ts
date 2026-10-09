import { PrismaPg } from "@prisma/adapter-pg"
import { PrismaClient } from "@/lib/generated/prisma/client"

const globalForPrisma = global as unknown as { prisma: PrismaClient }

// Prisma 7 ya no trae motor propio ni lee la URL del esquema: se conecta a
// través de un adaptador del driver de Postgres. En ejecución se usa la URL con
// pooling; la directa queda para las migraciones (prisma.config.ts).
function createClient(): PrismaClient {
  const connectionString =
    process.env.POSTGRES_PRISMA_URL || process.env.POSTGRES_URL_NON_POOLING

  return new PrismaClient({ adapter: new PrismaPg({ connectionString }) })
}

export const prisma = globalForPrisma.prisma || createClient()

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma
