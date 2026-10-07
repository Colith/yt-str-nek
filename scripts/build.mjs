#!/usr/bin/env node
/**
 * Build con migraciones aplicadas en Vercel.
 *
 * Sin esto, el orden importa y hay que acordarse: si se despliega código que
 * usa una columna nueva antes de aplicar la migración, Prisma lanza P2022 y se
 * cae TODO lo que toque esa tabla, incluido el login.
 *
 * Solo se aplican en Vercel. En local, migrar en cada build sería una
 * sorpresa y haría fallar el build con la base apagada: ahí se usa
 * `npm run db:migrate`.
 *
 * Si la migración falla, el build CONTINÚA. Que no se pueda llegar a la base
 * desde el entorno de compilación es normal, y perder el despliegue entero por
 * eso es peor que perder la automatización: mejor publicar y avisar.
 */
import { spawnSync } from "node:child_process"

const isVercel = Boolean(process.env.VERCEL)

function run(command, args, { fatal = true } = {}) {
  const result = spawnSync(command, args, {
    stdio: "inherit",
    shell: process.platform === "win32",
  })

  if (result.status === 0) return true

  if (fatal) {
    process.exit(result.status ?? 1)
  }

  return false
}

if (isVercel) {
  console.log("==> Aplicando migraciones antes de compilar")

  const applied = run("npx", ["prisma", "migrate", "deploy"], { fatal: false })

  if (!applied) {
    console.warn(
      [
        "",
        "  AVISO: no se pudieron aplicar las migraciones (la base de datos no es",
        "  alcanzable desde el entorno de compilación, o la migración falló).",
        "",
        "  Se sigue compilando y publicando, pero si el código usa columnas nuevas",
        "  la web dará errores P2022 hasta que se apliquen a mano:",
        "",
        "    bash scripts/prod-bootstrap.sh \"<url-de-la-base>\" <usuario>",
        "",
      ].join("\n")
    )
  }
}

run("npx", ["next", "build"])