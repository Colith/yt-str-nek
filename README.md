# Sakura Ryū

Panel de moderadores para gestionar la cola de peticiones de música de un stream, sin depender del chat del canal. Interfaz con estética sakura (tema claro y oscuro) y sincronización entre varios moderadores.

## Funcionalidades

- Búsqueda de vídeos en YouTube con miniaturas, canal y duración
- Alta de canciones pegando directamente el enlace (`watch?v=`, `youtu.be/`, `/shorts/`, `/embed/`)
- Nombre del solicitante opcional en cada canción
- **Una cola por streamer**: cada usuario con rol `streamer` tiene su propia cola y su propio historial
- Cada cola admite un máximo de **20** canciones
- Reordenar la cola arrastrando (drag & drop) o con teclado
- Marcar como reproducida, lo que mueve la canción al historial
- Reañadir canciones desde el historial, o vaciarlo entero de una vez
- Tres roles: `admin`, `mod` y `streamer`
- Gestión de usuarios desde `/users`: crear, renombrar, cambiar contraseña, rol y eliminar
- **Foto de perfil** por usuario en `/settings`: se recorta en el navegador y se guarda en la base de datos
- El volumen con el que escucha cada usuario se guarda en su cuenta y se recupera al entrar
- Sincronización entre pestañas (sondeo cada 5 s + al recuperar el foco)
- Acceso restringido por usuario y contraseña (sesión con cookie `httpOnly` firmada)
- Cabecera fija en todas las páginas: a la izquierda las secciones a las que puede ir el rol, en el centro la marca y a la derecha la apariencia, los datos de la cuenta y el cierre de sesión
- El acceso empieza por el login: sin sesión se va al login, y al entrar cada rol va directo a su página
- Un streamer también entra al panel para añadir sus propias canciones, sin depender de un moderador
- Reproductor en `/player` para el streamer: la música empieza y avanza sola mientras los moderadores añaden canciones
- Transiciones de vista al navegar entre el panel y el reproductor

## Páginas

| Ruta | Para qué |
| --- | --- |
| `/` | Redirige a la página del rol: `/mod` para admin y mod, `/player` para streamer |
| `/login` | Inicio de sesión |
| `/mod` | Panel: cola, búsqueda e historial de la cola elegida |
| `/player` | Reproductor de la cola de un streamer |
| `/users` | Gestión de usuarios, contraseñas y roles |
| `/settings` | Ajustes de la cuenta: la foto de perfil |

Todas las páginas menos `/login` exigen sesión: si entras sin ella, el proxy te lleva
al login **recordando de dónde venías** (ruta y parámetros, `callbackUrl`). Al entrar se
vuelve a esa página si tu rol puede abrirla; si no, se va a la que te corresponde por
rol. Con sesión ya abierta, `/login` te manda directa a tu página.

## La cabecera

Todas las páginas de la aplicación llevan la misma cabecera, y cada rol ve en ella solo
lo que puede usar. Lo que no se puede hacer no aparece: no hay botones desactivados ni
enlaces que no llevan a ningún sitio.

| | `admin` | `mod` | `streamer` |
| --- | --- | --- | --- |
| Izquierda | Panel · Reproductor · Usuarios | Panel · Reproductor | Mi cola · Reproductor |
| Centro | Marca de la página (el nombre) | Ídem | Ídem |
| Derecha | Apariencia · avatar, nombre y rol · cerrar sesión | Ídem | Ídem |

- **Panel** (o **Mi cola** para un streamer) lleva a `/mod`, donde se gestiona la cola.
- **Reproductor** lleva a `/player` **en la misma pestaña**: el enlace no abre ninguna
  ventana nueva. En el panel, y solo si la cola abierta viene en la URL, apunta a la cola
  que se está gestionando (`/player?streamer=<id>`).
- **Usuarios** solo lo ve un `admin`.
- El bloque de la derecha (avatar, nombre y rol) es un enlace a `/settings`, donde el
  usuario cambia su foto de perfil.
- La marca del centro es el propio nombre de la página, y lleva a la página del rol: en
  modo normal se ve en latín (Kaushan Script, una pincelada rotunda como el rótulo de
  una viñeta de manga) y en modo otaku en japonés, en katakana (サクラリュウ, en Yomogi,
  letra japonesa a mano con un pelo de trazo para que se lea bien pequeña). El nombre
  y su versión japonesa están en `lib/site.ts`: cambiar el nombre de la página es
  cambiar una línea, no buscarla por el proyecto.
- La sección en la que se está no es un enlace: aparece marcada con `aria-current`.
- Los botones de la izquierda se definen por rol en `lib/navigation.ts`, sin React, para
  poder probarlos sin montar componentes.

## Roles

| Rol | Panel `/mod` | Reproductor `/player` | Usuarios `/users` | En la cabecera |
| --- | --- | --- | --- | --- |
| `admin` | Sí, todas las colas | Sí, cualquier cola | Sí | Panel, Reproductor, Usuarios |
| `mod` | Sí, todas las colas | Sí, cualquier cola | No | Panel, Reproductor |
| `streamer` | Sí, solo la suya | Solo la suya | No | Mi cola, Reproductor |

Un `streamer` entra al panel igual que un moderador, pero el servidor le limita a su
propia cola: puede buscar, añadir canciones, reordenar y marcar como reproducidas sin
depender de nadie, y nunca ve las colas de los demás.

El rol viaja dentro del JWT, así que un cambio de rol no invalida la sesión abierta:
hay que volver a entrar para que el proxy lo tenga en cuenta.

Dos salvaguardas para no dejar la aplicación inservible: no se puede quitar el rol ni
borrar al último `admin`, y no se puede eliminar a uno mismo.

El primer usuario creado es `admin`. Los siguientes, si no se indica rol, son `mod`.

## Una cola por streamer

Cada usuario con rol `streamer` es dueño de una cola y de un historial. Las posiciones y
el máximo de 20 canciones van por streamer, así que lo que pasa en una cola no afecta a
las demás.

- **Admin y mod** eligen arriba del panel `/mod` la cola de qué streamer gestionan.
  Buscar, añadir por enlace, reordenar, marcar como reproducida y el historial actúan
  sobre ese streamer. La elección va en la URL (`/mod?streamer=<id>`) y el navegador
  recuerda la última.
- **Un streamer** entra tanto a `/player` como al panel `/mod` y recibe su propia cola,
  sin elegir nada. El servidor ignora cualquier otro streamer que venga en la petición,
  así que no puede ver ni tocar la cola de otro.
- Admin y mod también pueden abrir el reproductor de cualquier streamer con
  `/player?streamer=<id>`, o desde el botón **Reproductor** de la cabecera, que apunta a
  la cola que se está gestionando y se abre en la misma pestaña.

Si todavía no existe ningún streamer, el panel lo avisa y un admin puede crearlo en
`/users`.

Al aplicar la migración que introduce esto, lo que hubiera en la cola y el historial
compartidos pasa al streamer más antiguo. Si en ese momento no existe ninguno, se
descarta.

## Usuarios

Solo los `admin` entran en `/users`, y desde ahí crean, renombran, cambian la contraseña,
cambian el rol o eliminan usuarios.

Al borrar un usuario, las canciones que había añadido a las colas de otros **se quedan**
en la cola y en el historial, pero sin autor. Si el usuario era streamer, su propia cola
y su historial se borran con él.

### Un detalle de la sesión

La sesión es un JWT sin estado: no hay lista de sesiones en el servidor que poder revocar.
Cerrar sesión borra la cookie del navegador, pero una copia de esa cookie seguiría siendo
válida hasta que expire (7 días). Para invalidar de verdad hay que cambiar la contraseña
del usuario.

## La foto de perfil

Cada usuario puede subir su propia foto desde `/settings`, a la que se llega pulsando su
bloque en la cabecera (avatar, nombre y rol). La foto se ve en la cabecera y en la lista
de usuarios de `/users`.

- **El recorte se hace en el navegador**: la imagen se recorta a un cuadrado de 256×256
  (el centro, que es lo que se espera de una foto de perfil) y se convierte a WebP antes
  de subirla. Lo que llega al servidor son unos pocos KiB, no los varios megas de la foto
  original.
- **Se guarda en la base de datos**, en la tabla `Avatar`, no en un fichero: la aplicación
  se despliega en Vercel, donde el disco es temporal y una foto subida a `public/` se
  perdería en el siguiente despliegue. Va en su propia tabla para que las consultas de
  usuario no arrastren la imagen.
- **El tipo se deduce de los bytes del fichero**, no del `content-type` que declara el
  cliente: lo que se comprueba es lo que después se sirve. Se aceptan PNG, JPEG y WebP, y
  el límite son 512 KiB.
- **Solo se ven las fotos de dentro de la aplicación**: `GET /api/avatars/<id>` exige
  sesión, así que la imagen no se sirve en abierto. Por eso las fotos van sin optimizar
  (el optimizador de imágenes de Next pide la URL sin la cookie de sesión) y con la
  versión de la imagen en la URL (`?v=`), para que una foto nueva no se quede la vieja
  en la caché.

Los ajustes están preparados para crecer: ahora solo tienen la foto de perfil, pero la
página ya tiene su sitio en la cabecera y su propia ruta.

## Reproductor

`/player` muestra la canción actual con portada, canal y quién la pidió. Tiene play/pausa,
un botón para saltar a la siguiente y un deslizador de volumen.

### Reproducción automática

El reproductor está pensado para dejarlo abierto y no tocarlo:

- Al abrirlo, la primera canción de la cola empieza a sonar sola.
- Cuando una canción termina, se marca como reproducida y suena la siguiente.
- Si la cola se queda vacía, la página sigue consultando cada pocos segundos y arranca
  en cuanto un moderador añade algo.
- Si un vídeo no se puede reproducir (borrado, privado o con la inserción desactivada),
  se salta para que la cola no se quede parada.
- Con dos reproductores abiertos para el mismo streamer, la canción solo avanza una vez.

El reproductor de YouTube se crea una sola vez y se reutiliza: al pasar de canción solo
se le cambia el vídeo. Así conserva el permiso de reproducción que ya tiene y la
siguiente arranca sin intervención.

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
botón **Activar audio**. La comprobación es necesaria porque la IFrame API de
YouTube no lanza ningún error cuando no arranca: simplemente se queda quieta.

### Sobre el audio

Los navegadores pueden bloquear la reproducción automática con sonido si el visitante
todavía no ha interactuado con la página. Normalmente basta con haber llegado al
reproductor haciendo clic en **Reproductor**, en la cabecera. Si aun así el navegador lo
impide, aparece un botón **Activar audio**: se pulsa una vez y el resto de la cola suena
sola. Como *Browser Source* de OBS esta restricción no existe.

El reproductor arranca con sonido, no silenciado. Arrancar en silencio y quitarlo
después hace que Chrome pause el vídeo, y la cola se quedaba parada.

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

Next.js 16 (App Router) · React 19 · TypeScript · Tailwind CSS v4 · shadcn/ui · Prisma 7 · PostgreSQL (Vercel Postgres) · jose (JWT) · bcryptjs · dnd-kit · next-themes · YouTube IFrame Player API

### Sobre Prisma 7

- Las URLs de conexión ya no van en `schema.prisma`. La de las migraciones se lee en
  `prisma.config.ts` y la de ejecución en `lib/prisma.ts`, que se conecta con el
  adaptador `@prisma/adapter-pg`.
- El cliente se genera en `lib/generated/prisma` y se importa desde ahí, no desde
  `@prisma/client`. Esa carpeta no se sube al repositorio: `npm install` la crea con
  `prisma generate`.
- La CLI ya no carga el `.env` sola; lo hace `prisma.config.ts` con `dotenv`. Una
  variable ya definida en el entorno manda sobre la del `.env`.
- `prisma migrate dev` ya no regenera el cliente ni lanza el seed: `npm run
  prisma:migrate` regenera el cliente, y el seed se lanza con `npm run db:seed`.

## Pruebas

Las pruebas usan [Vitest](https://vitest.dev) y no necesitan ninguna base de datos ni
clave de YouTube: se ejecutan tal cual después de `npm install`.

| Comando | Qué hace |
| --- | --- |
| `npm test` | Ejecuta todas las pruebas una vez |
| `npm run test:watch` | Las vuelve a ejecutar al guardar un archivo |
| `npm run test:coverage` | Igual que `npm test`, con informe de cobertura en `coverage/` |

Hay dos grupos, en `tests/`:

- **`tests/server`** corre en Node. Cubre las librerías de `lib/`, el proxy, todas las
  rutas de `app/api` y las migraciones. Las rutas se ejecutan contra un PostgreSQL real
  en memoria ([PGlite](https://pglite.dev)) al que se le aplican las migraciones del
  proyecto, así que se prueban el mismo SQL, las mismas restricciones y las mismas
  transacciones que en producción. Solo se sustituyen las cookies de la petición y las
  llamadas a la API de YouTube.
- **`tests/ui`** corre en jsdom con Testing Library. Cubre el login, la cabecera según el
  rol, el panel de moderadores, la gestión de usuarios, los ajustes de la foto de perfil,
  el reproductor, los hooks y lo que decide cada página según la sesión. El reproductor
  se prueba con un doble de la IFrame API de YouTube que permite simular que un vídeo
  empieza, termina, falla o queda bloqueado.

Lo que las pruebas no ejercitan: el arrastre con el ratón para reordenar la cola, el
recorte de la foto de perfil en el canvas del navegador, el `layout` raíz y la
reproducción real de YouTube en un navegador.

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
| `POSTGRES_PRISMA_URL` | URL de conexión (pooled) a PostgreSQL. Es la que usa la aplicación en ejecución |
| `POSTGRES_URL_NON_POOLING` | URL de conexión directa, usada por Prisma Migrate y por el seed |
| `AUTH_SECRET` | Clave para firmar la sesión. Genera con `openssl rand -base64 32` |
| `YOUTUBE_API_KEY` | Clave de la YouTube Data API v3 (necesaria para buscar y resolver vídeos) |
| `YOUTUBE_API_KEY_2` | Opcional: segunda clave (otro proyecto) para repartir la cuota diaria de búsquedas |
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

La búsqueda usa el endpoint `search` de la API, que tiene una **cuota diaria
corta** (Google aplica un límite de consultas de búsqueda al día por proyecto).
Para no agotarla:

- El panel busca **al enviar** (Enter o el botón), no en cada tecla.
- Cada consulta repetida se resuelve desde la caché del navegador.
- Si se agota, el panel lo dice claramente y sugiere añadir la canción pegando el
  enlace (que usa otro endpoint, con más margen).

Si tienes más de un proyecto de Google Cloud, pon el segundo en
`YOUTUBE_API_KEY_2`: cuando la clave principal agota su cuota, se reintenta sola
con la de reserva.

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
| `npm run prisma:migrate` | Crea una migración en desarrollo y regenera el cliente |
| `npm run db:migrate` | Aplica las migraciones pendientes (en local, a mano) |
| `bash scripts/prod-bootstrap.sh <url> [usuario]` | Aplica migraciones y crea/actualiza un mod contra otra base |

### Fondo de arte

El fondo es una **imagen monocroma** raster (`public/art/manga-art.png`) o
vectorial (`public/art/manga-tile.svg`), generada desde una carpeta de imágenes:

```bash
python3 scripts/build-art.py [carpeta]              # vectores (SVG)
python3 scripts/build-art.py [carpeta] --raster      # sin vectorizar (PNG)
```

Deja cada imagen en blanco y negro puro con **umbral adaptativo** (cada zona se
corta contra su entorno, así las zonas oscuras conservan textura y detalle).
Con `vtracer`, con **una sola** imagen genera esa imagen y con **varias** las
reparte en un `tile` repetible; con `--raster` se salta la vectorización y sale
un PNG a `RASTER_SIZE` (1920 px) con bordes suavizados (supersample `RASTER_SS` y
4 bits por canal). En la web se usa como máscara CSS, así que toma el color del
tema sin invertir nada; la presencia se controla con `--art-opacity` en
`app/globals.css` y el detalle con `TRACE_SIZE`, `LAT_WINDOW` y, en raster,
`RASTER_SIZE`/`RASTER_SS` en el script.

Requiere ImageMagick 7 (`magick`) y `vtracer` (`pip install vtracer`).

### Menú de Apariencia: modo normal y modo otaku

El botón de paleta de la cabecera (`/mod`, `/player` y `/users`) abre el
**Menú de Apariencia**, con dos ajustes guardados **en la cuenta**:

- **Tema**: claro, oscuro o el del sistema (`next-themes`).
- **Fondo**: **modo normal** (diseño limpio, sin ilustración) o **modo otaku**
  (con la ilustración de manga detrás del contenido).

El fondo elegido se guarda en la columna `User.artStyle` (`"normal"` por
defecto). Al cargar, `app/layout.tsx` lo lee y lo pinta como `data-art` en el
`<html>`; el CSS enseña la ilustración solo bajo `html[data-art="otaku"]`. El
cambio se aplica al vuelo con `PUT /api/me/style`, sin recargar. Como el layout
depende de la sesión, todas las páginas se renderizan en el servidor a petición.

El logotipo sigue al fondo: con el mismo atributo `data-art`, el nombre de la
cabecera y del login se ven en latín (Kaushan Script) en modo normal y en japonés
(サクラリュウ, en Yomogi) en modo otaku. El componente `Wordmark` pinta las dos
versiones y el CSS esconde la que no toca, así que el cambio es instantáneo y
no hay parpadeo al recargar.

### Preparar la base de producción

Para desplegar en Vercel, las migraciones no se aplican solas en el build. Usa el script, que pide la contraseña de forma oculta y no guarda la URL en disco:

```bash
bash scripts/prod-bootstrap.sh "postgresql://...tu-url..." nek
```

Pide la contraseña del mod por terminal. Si el usuario ya existe, actualiza su contraseña.
