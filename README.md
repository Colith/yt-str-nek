# yt-str-nek 

Panel de moderadores para gestionar la cola de peticiones de música de un stream, sin depender del chat del canal. Interfaz con estética sakura (tema claro y oscuro) y sincronización entre varios moderadores.

## Funcionalidades

- Búsqueda de vídeos en YouTube con miniaturas, canal y duración
- Alta de canciones pegando directamente el enlace (`watch?v=`, `youtu.be/`, `/shorts/`, `/embed/`)
- Nombre del solicitante opcional en cada canción
- Cola con máximo **20** canciones
- Reordenar la cola arrastrando (drag & drop) o con teclado
- Marcar como reproducida, lo que mueve la canción al historial
- Reañadir canciones desde el historial, o vaciarlo entero de una vez
- Tres roles: `admin`, `mod` y `streamer`
- Gestión de usuarios desde `/users`: crear, renombrar, cambiar contraseña, rol y eliminar
- El volumen con el que escucha cada usuario se guarda en su cuenta y se recupera al entrar
- Sincronización entre pestañas (sondeo cada 5 s + al recuperar el foco)
- Acceso restringido por usuario y contraseña (sesión con cookie `httpOnly` firmada)
- Reproductor en `/player` para el streamer, con la canción actual, control de volumen y avance automático al terminar

## Páginas

| Ruta | Para qué |
| --- | --- |
| `/` | Portada: elige modo moderador o modo streamer |
| `/login` | Inicio de sesión |
| `/mod` | Panel de moderadores: cola, búsqueda, historial |
| `/player` | Reproductor del streamer |
| `/users` | Gestión de usuarios, contraseñas y roles |

`/mod`, `/player` y `/users` exigen sesión. Si entras sin ella, el login te devuelve a
la página que intentabas abrir. La portada solo muestra los modos a los que tu rol tiene
acceso.

## Roles

| Rol | Panel `/mod` | Reproductor `/player` | Usuarios `/users` |
| --- | --- | --- | --- |
| `admin` | Sí | Sí | Sí |
| `mod` | Sí | Sí | No |
| `streamer` | No | Sí | No |

El rol viaja dentro del JWT, así que un cambio de rol no invalida la sesión abierta:
hay que volver a entrar para que el proxy lo tenga en cuenta.

Dos salvaguardas para no dejar la aplicación inservible: no se puede quitar el rol ni
borrar al último `admin`, y no se puede eliminar a uno mismo.

El primer usuario creado es `admin`. Los siguientes, si no se indica rol, son `mod`.

## Usuarios

Solo los `admin` entran en `/users`, y desde ahí crean, renombran, cambian la contraseña,
cambian el rol o eliminan usuarios.

Al borrar un usuario, las canciones que había añadido **se quedan** en la cola y en el
historial, pero sin autor. Es preferible a borrar la cola entera por un cambio de
contraseña.

### Un detalle de la sesión

La sesión es un JWT sin estado: no hay lista de sesiones en el servidor que poder revocar.
Cerrar sesión borra la cookie del navegador, pero una copia de esa cookie seguiría siendo
válida hasta que expire (7 días). Para invalidar de verdad hay que cambiar la contraseña
del usuario.

## Reproductor

`/player` muestra la canción actual con portada, canal y quién la pidió. Tiene play/pausa,
un botón para saltar a la siguiente y un deslizador de volumen. Cuando la canción
termina, se marca como reproducida y carga la siguiente sola.

El volumen va de 0 a 100, con un deslizador vertical y el porcentaje al lado. El valor se
conserva al cambiar de canción y **se guarda en la cuenta del usuario**, así que no hay que
volver a ajustarlo en cada visita. Los 80 % son solo el valor para quien aún no ha elegido
ninguno.

Para tocarlo a mano:

```bash
npx prisma studio   # campo "volume" de la tabla User
```

La barra de tiempo va de 0 a la duración y se arrastra para saltar al punto que elijas,
con el tiempo actual y el total a cada lado.

Hay dos modos de ver la canción: **solo audio** y **con vídeo**. Por defecto solo audio, que
es lo habitual si el reproductor va en una pantalla aparte. El botón cambia entre uno y
otro sin parar la música.

Cada entrada de la cola se identifica por su propio id, no por el vídeo. Así, si la misma
canción está en la cola dos veces, al terminar la primera se pasa a la segunda en lugar de
volver a empezar el vídeo.

Si el navegador bloquea la reproducción automática, la página lo detecta y muestra un
botón **Activar reproducción**. La comprobación es necesaria porque la IFrame API de
YouTube no lanza ningún error cuando no arranca: simplemente se queda quieta.

### Sobre el audio

El reproductor arranca la canción silenciada y acto seguido activa el volumen, porque
los navegadores bloquean la reproducción automática con sonido si el visitante no ha
interactuado antes. Si el navegador lo impide, aparece un botón **Activar reproducción**
para que pulses una vez.

Para que el audio llegue al directo, la música tiene que pasar por la captura de
escritorio de OBS. Si quieres evitar arrastrar el resto del sonido del navegador al
micro, conviene una tarjeta de audio virtual.

Como la página requiere sesión, si la quieres usar como *Browser Source* de OBS tendrás
que iniciar sesión dentro de la fuente. La alternativa es abrirla en un navegador normal
en una segunda pantalla, que es lo habitual.

Ten en cuenta también las reglas de YouTube sobre retransmisión de contenido con
derechos de autor: una cuenta con monetización puede recibir un strike o una
suspensión por retransmitir su música.

## Stack

Next.js 16 (App Router) · React 19 · TypeScript · Tailwind CSS v4 · shadcn/ui · Prisma · PostgreSQL (Vercel Postgres) · jose (JWT) · bcryptjs · dnd-kit · next-themes · YouTube IFrame Player API

## Puesta en marcha

### 1. Dependencias y variables de entorno

```bash
npm install
cp .env.example .env
```

Completa `.env` con tus valores (ver más abajo la tabla de variables).

### 2. Base de datos

```bash
npx prisma migrate deploy   # aplica migraciones
npm run db:seed             # crea el primer usuario si defines SEED_USERNAME/SEED_PASSWORD
```

Para desarrollo local puedes levantar Postgres con Docker:

```bash
docker run -d --name ytstrnek-pg \
  -e POSTGRES_PASSWORD=postgres -e POSTGRES_USER=postgres -e POSTGRES_DB=ytstrnek \
  -p 5432:5432 postgres:16-alpine
```

### 3. Desarrollo

```bash
npm run dev
```

Abre `http://localhost:3000` e inicia sesión con el usuario creado en el seed.

## Variables de entorno

| Variable | Descripción |
| --- | --- |
| `POSTGRES_PRISMA_URL` | URL de conexión (pooled) a PostgreSQL |
| `POSTGRES_URL_NON_POOLING` | URL de conexión directa, usada por Prisma Migrate |
| `AUTH_SECRET` | Clave para firmar la sesión. Genera con `openssl rand -base64 32` |
| `YOUTUBE_API_KEY` | Clave de la YouTube Data API v3 (necesaria para buscar y resolver vídeos) |
| `SEED_USERNAME` | Usuario inicial que crea `npm run db:seed` |
| `SEED_PASSWORD` | Contraseña del usuario inicial |
| `SEED_ROLE` | Rol del usuario inicial: `admin`, `mod` o `streamer`. Por defecto `admin` |

### Obtener la YOUTUBE_API_KEY

1. Ve a [Google Cloud Console](https://console.cloud.google.com/) y crea un proyecto.
2. En **APIs y servicios → Biblioteca**, busca *YouTube Data API v3* y actívala.
3. En **APIs y servicios → Credenciales → Crear credenciales → Clave de API**.
4. Opcionalmente restringe la clave por sitio (referencias HTTP) a `*.vercel.app` y `localhost`.
5. Copia la clave a `.env` como `YOUTUBE_API_KEY`.

Sin esta clave, añadir canciones por enlace y la búsqueda devolverán un error indicando que falta configurarla.

## Despliegue en Vercel

1. Sube el repositorio a GitHub.
2. En Vercel, importa el repositorio.
3. Crea una base de datos **Storage → Postgres** y conecta el proyecto.
4. Añade las variables de entorno en **Settings → Environment Variables**.
5. Vercel ejecuta `npm install` (que dispara `prisma generate`) y `npm run build`.

### Las migraciones se aplican solas al desplegar

`npm run build` delega en `scripts/build.mjs`, que en Vercel lanza
`prisma migrate deploy` antes de compilar. Es a propósito: si se publica código
que usa una columna nueva antes de aplicar la migración, Prisma lanza `P2022` y
se cae **todo** lo que toque esa tabla, incluido el login.

Si la migración falla, el despliegue se corta en vez de publicar código
inc compatible con la base. En local no se migra en el build, para que no falle
un `npm run build` con la base apagada; para eso está `npm run db:migrate`.

Para crear el primer usuario en producción, define `SEED_USERNAME` y `SEED_PASSWORD` en Vercel y ejecuta `npm run db:seed` de forma local apuntando a la misma base de datos.

## Comandos

| Comando | Descripción |
| --- | --- |
| `npm run dev` | Servidor de desarrollo |
| `npm run build` | Build de producción |
| `npm run lint` | ESLint |
| `npx prisma studio` | Interfaz visual de la base de datos |
| `npm run db:seed` | Crea el usuario inicial |
| `npm run db:seed -- --force` | Crea el usuario o actualiza su contraseña y rol |
| `npm run prisma:migrate` | Crea una migración en desarrollo |
| `npm run db:migrate` | Aplica las migraciones pendientes (en local, a mano) |
| `bash scripts/prod-bootstrap.sh <url> [usuario]` | Aplica migraciones y crea/actualiza un mod contra otra base |

### Preparar la base de producción

Para desplegar en Vercel, las migraciones no se aplican solas en el build. Usa el script, que pide la contraseña de forma oculta y no guarda la URL en disco:

```bash
bash scripts/prod-bootstrap.sh "postgresql://...tu-url..." nek
```

Pide la contraseña del mod por terminal. Si el usuario ya existe, actualiza su contraseña.
