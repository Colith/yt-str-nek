import { readFileSync, readdirSync } from "node:fs"
import { join } from "node:path"
import { PGlite } from "@electric-sql/pglite"
import { PrismaPGlite } from "pglite-prisma-adapter"
import { PrismaClient } from "@/lib/generated/prisma/client"

const MIGRATIONS_DIR = join(process.cwd(), "prisma", "migrations")

/** Carpetas de migración en el orden en que Prisma las aplica. */
export function migrationNames(): string[] {
  return readdirSync(MIGRATIONS_DIR, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort()
}

export function migrationSql(name: string): string {
  return readFileSync(join(MIGRATIONS_DIR, name, "migration.sql"), "utf8")
}

/**
 * Postgres en memoria (PGlite) con las migraciones reales del proyecto.
 *
 * Así las pruebas ejecutan el mismo SQL, las mismas restricciones y las mismas
 * transacciones que producción, sin necesitar un servidor de base de datos.
 */
export async function createTestDatabase(upTo?: string) {
  const pg = new PGlite()
  for (const name of migrationNames()) {
    await pg.exec(migrationSql(name))
    if (name === upTo) break
  }
  return pg
}

export function createTestPrisma(pg: PGlite): PrismaClient {
  return new PrismaClient({ adapter: new PrismaPGlite(pg) })
}
