import { PrismaClient } from "@prisma/client"
import bcrypt from "bcryptjs"

const prisma = new PrismaClient()

const MIN_PASSWORD_LENGTH = 8
const ROLES = ["admin", "mod", "streamer"] as const
type Role = (typeof ROLES)[number]

async function main() {
  const username = process.env.SEED_USERNAME?.trim()
  const password = process.env.SEED_PASSWORD
  const force = process.argv.includes("--force")

  if (!username || !password) {
    console.log("Seed omitido: define SEED_USERNAME y SEED_PASSWORD")
    return
  }

  if (password.length < MIN_PASSWORD_LENGTH) {
    console.log(
      `La contraseña debe tener al menos ${MIN_PASSWORD_LENGTH} caracteres.`
    )
    process.exit(1)
  }

  // Sin SEED_ROLE se respeta el que ya tiene el usuario; si es nuevo y no se
  // dice nada, se crea como admin, porque es quien podrá entrar en /users.
  const requestedRole = process.env.SEED_ROLE?.trim()
  if (requestedRole && !ROLES.includes(requestedRole as Role)) {
    console.log(`Rol desconocido: "${requestedRole}". Usa: ${ROLES.join(", ")}`)
    process.exit(1)
  }

  const existing = await prisma.user.findUnique({ where: { username } })

  if (existing) {
    if (!force) {
      console.log(`El usuario "${username}" ya existe.`)
      console.log("Usa --force para actualizar su contraseña:")
      console.log("  npm run db:seed -- --force")
      return
    }

    await prisma.user.update({
      where: { username },
      data: {
        password: await bcrypt.hash(password, 10),
        ...(requestedRole ? { role: requestedRole as Role } : {}),
      },
    })

    console.log(`Contraseña actualizada para "${username}"`)
    if (requestedRole) console.log(`Rol actualizado a "${requestedRole}"`)
    return
  }

  const role: Role = (requestedRole as Role) ?? "admin"

  await prisma.user.create({
    data: {
      username,
      password: await bcrypt.hash(password, 10),
      role,
    },
  })

  console.log(`Usuario creado: ${username} (rol: ${role})`)
}

main()
  .catch((error) => {
    console.error(error)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })