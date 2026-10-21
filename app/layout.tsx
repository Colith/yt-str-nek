import type { Metadata } from "next"
import { Cormorant_Garamond, Inter, Noto_Serif_JP, Shippori_Mincho } from "next/font/google"
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

// Las dos tipografías del logotipo: la latina, elegante y de mucho contraste,
// y la japonesa, que es la que aparece en modo otaku.
const cormorant = Cormorant_Garamond({
  subsets: ["latin"],
  variable: "--font-cormorant",
  weight: ["500", "600"],
})

// Mincho: la voz clásica del japonés impreso, la del logotipo en modo otaku.
// El subset solo decide qué archivos se precargan: los kanji (桜龍) siguen
// viniendo, porque Google los reparte en rangos de caracteres que el
// navegador pide solo cuando hacen falta.
const shippori = Shippori_Mincho({
  subsets: ["latin"],
  variable: "--font-shippori",
  weight: ["600"],
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
        className={`${inter.variable} ${notoSerifJP.variable} ${cormorant.variable} ${shippori.variable} font-sans antialiased`}
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