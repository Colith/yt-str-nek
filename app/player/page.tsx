import { redirect } from "next/navigation"
import { getSession } from "@/lib/auth"
import { Player } from "@/components/player/player"

export const metadata = {
  title: "Reproductor · yt-str-nek",
}

export default async function PlayerPage() {
  const session = await getSession()
  if (!session) redirect("/login?callbackUrl=/player")

  return <Player />
}