import type { Metadata } from "next"
import { Inter, Noto_Serif_JP } from "next/font/google"
import "./globals.css"
import { Providers } from "@/components/providers"
import { SakuraPetals } from "@/components/sakura/sakura-petals"

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
})

const notoSerifJP = Noto_Serif_JP({
  subsets: ["latin"],
  variable: "--font-noto-serif-jp",
  weight: ["400", "500", "600", "700"],
})

export const metadata: Metadata = {
  title: "yt-str-nek",
  description: "Gestor de cola de música para moderadores",
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

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="es" suppressHydrationWarning>
      <body className={`${inter.variable} ${notoSerifJP.variable} font-sans antialiased`}>
        <Providers>
          <SakuraPetals />
          <div className="relative z-10">{children}</div>
        </Providers>
      </body>
    </html>
  )
}