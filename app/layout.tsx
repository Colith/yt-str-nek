import type { Metadata } from "next"
import { Inter, Kaushan_Script, Noto_Serif_JP, Yomogi } from "next/font/google"
import "./globals.css"
import { Providers } from "@/components/providers"
import { SakuraPetals } from "@/components/sakura/sakura-petals"
import { MangaArtwork } from "@/components/background/manga-artwork"
import { getSession } from "@/lib/auth"
import { getArtStyle } from "@/lib/preferences"
import { SITE } from "@/lib/site"

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
})

const notoSerifJP = Noto_Serif_JP({
  subsets: ["latin"],
  variable: "--font-noto-serif-jp",
  weight: ["400", "500", "600", "700"],
})

// Las dos tipografías del logotipo: la latina, escrita a pincel como el rótulo
// de una viñeta de manga, y la japonesa, que es la que aparece en modo otaku.
// Kaushan Script solo tiene un peso: con font-semibold el navegador
// sintetizaría un negrita falso, así que el logotipo la usa tal cual.
const kaushan = Kaushan_Script({
  subsets: ["latin"],
  variable: "--font-kaushan",
  weight: ["400"],
})

// Yomogi: letra japonesa a mano, de rotulador. El subset solo decide qué
// archivos se precargan: las letras japonesas (サクラリュウ) siguen viniendo,
// porque Google las reparte en rangos de caracteres que el navegador pide
// solo cuando hacen falta.
const yomogi = Yomogi({
  subsets: ["latin"],
  variable: "--font-yomogi",
  weight: ["400"],
})

export const metadata: Metadata = {
  title: SITE.name,
  description: SITE.tagline,
  icons: {
    icon: [
      { url: "/favicon-512.png", sizes: "512x512" },
      { url: "/favicon-384.png", sizes: "384x384" },
      { url: "/favicon-256.png", sizes: "256x256" },
      { url: "/favicon-192.png", sizes: "192x192" },
      { url: "/favicon-64.png", sizes: "64x64" },
      { url: "/favicon.ico", sizes: "any" },
    ],
    shortcut: "/favicon-512.png",
    apple: "/favicon-512.png",
  },
}

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  // El fondo elegido por cada usuario se marca en el <html> con un atributo
  // (`data-art`). next-themes ya usa la clase `dark`/`light`, así que el modo
  // va aparte para no pisarse. Como depende de la sesión, el layout es dinámico.
  const session = await getSession()
  const artStyle = session ? await getArtStyle(session.id) : "normal"

  return (
    <html lang="es" data-art={artStyle} suppressHydrationWarning>
      <body
        className={`${inter.variable} ${notoSerifJP.variable} ${kaushan.variable} ${yomogi.variable} font-sans antialiased`}
      >
        <Providers>
          <MangaArtwork />
          <SakuraPetals />
          <div className="relative z-10">{children}</div>
        </Providers>
      </body>
    </html>
  )
}