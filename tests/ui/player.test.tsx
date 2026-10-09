import { act, fireEvent, render, screen } from "@testing-library/react"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { toast } from "sonner"
import type { PlayerSong } from "@/app/api/player/current/route"
import { Player } from "@/components/player/player"
import {
  FakePlayer,
  STATE,
  installFakeYouTube,
  thePlayer,
} from "../helpers/fake-youtube-player"
import { mockApi } from "../helpers/fetch"
import { router } from "../helpers/navigation"

const STREAMER = { id: "s1", username: "directo" }

function song(n: number, extra: Partial<PlayerSong> = {}): PlayerSong {
  return {
    queueItemId: `q${n}`,
    youtubeId: `v${n}`,
    title: `Canción ${n}`,
    channel: "Canal",
    thumbnail: "",
    durationSec: 200,
    requesterName: null,
    upNext: 0,
    ...extra,
  }
}

/** Servidor de mentira con la cola de un streamer, como la ve el reproductor. */
function playerServer(initial: PlayerSong[]) {
  const state = {
    queue: [...initial],
    savedVolume: null as number | null,
    failNext: false,
    unauthorized: false,
  }

  const api = mockApi((call) => {
    if (call.path === "/api/player/current") {
      if (state.unauthorized) return { status: 401, body: { error: "No autorizado" } }
      const upNext = Math.max(0, state.queue.length - 1)
      const [first] = state.queue
      return {
        body: {
          current: first ? { ...first, upNext } : null,
          upNext,
          savedVolume: state.savedVolume,
        },
      }
    }

    if (call.path === "/api/player/next") {
      if (state.failNext) return { status: 500, body: { error: "fallo" } }
      if (state.queue[0]?.queueItemId !== call.body.queueItemId) {
        return { status: 409, body: { error: "Esa canción ya no está en la cola" } }
      }
      state.queue.shift()
      return { body: { ok: true } }
    }

    if (call.path === "/api/player/volume") return { body: { ok: true } }
    return { status: 404 }
  })

  return { state, api }
}

/** Deja pasar el tiempo y que se resuelvan las peticiones pendientes. */
const tick = (ms = 10) =>
  act(async () => {
    await vi.advanceTimersByTimeAsync(ms)
  })

async function openPlayer(streamers: (typeof STREAMER)[] = []) {
  render(<Player streamer={STREAMER} streamers={streamers} />)
  await tick()
}

/** YouTube termina de cargar y la canción empieza a sonar. */
async function startPlaying() {
  act(() => thePlayer().ready())
  act(() => thePlayer().emit(STATE.PLAYING))
  // Margen para que un aviso de fin ya no se confunda con el de la canción anterior
  await tick(2000)
}

beforeEach(() => {
  vi.useFakeTimers()
  installFakeYouTube()
})

describe("reproducción automática", () => {
  it("al abrir, la primera canción de la cola empieza a sonar sola y con sonido", async () => {
    const { api } = playerServer([song(1), song(2)])

    await openPlayer()
    const player = thePlayer()
    act(() => player.ready())

    expect(api.calls[0].query.get("streamerId")).toBe("s1")
    expect(player.options.videoId).toBe("v1")
    expect(player.options.playerVars?.autoplay).toBe(1)
    expect(player.playVideo).toHaveBeenCalled()
    // Arranca con sonido: silenciar y quitar el silencio después hace que el
    // navegador pause el vídeo.
    expect(player.mute).not.toHaveBeenCalled()
    expect(player.muted).toBe(false)
    expect(player.volume).toBe(80)

    act(() => player.emit(STATE.PLAYING))
    expect(screen.getByText("Canción 1")).toBeInTheDocument()
    expect(screen.getByRole("button", { name: "Pausar" })).toBeInTheDocument()
    expect(screen.queryByRole("button", { name: "Activar audio" })).not.toBeInTheDocument()
  })

  it("al terminar una canción la marca como reproducida y suena la siguiente", async () => {
    const { api, state } = playerServer([song(1), song(2)])
    await openPlayer()
    await startPlaying()

    act(() => thePlayer().emit(STATE.ENDED))
    await tick()

    expect(api.to("POST", "/api/player/next")[0].body).toEqual({
      queueItemId: "q1",
      streamerId: "s1",
    })
    expect(state.queue.map((s) => s.queueItemId)).toEqual(["q2"])
    expect(screen.getByText("Canción 2")).toBeInTheDocument()
  })

  it("reutiliza el mismo reproductor para la canción siguiente, sin recrearlo", async () => {
    playerServer([song(1), song(2)])
    await openPlayer()
    await startPlaying()
    const player = thePlayer()

    act(() => player.emit(STATE.ENDED))
    await tick()

    expect(FakePlayer.instances).toHaveLength(1)
    expect(player.destroy).not.toHaveBeenCalled()
    expect(player.loadVideoById).toHaveBeenCalledWith("v2", 0)
    expect(player.muted).toBe(false)
  })

  it("recorre toda la cola sin intervención hasta vaciarla", async () => {
    const { api, state } = playerServer([song(1), song(2), song(3)])
    await openPlayer()
    await startPlaying()
    const player = thePlayer()

    for (const expected of ["v2", "v3"]) {
      act(() => player.emit(STATE.ENDED))
      await tick()
      expect(player.videoId).toBe(expected)
      act(() => player.emit(STATE.PLAYING))
      await tick(2000)
    }
    act(() => player.emit(STATE.ENDED))
    await tick()

    expect(api.to("POST", "/api/player/next")).toHaveLength(3)
    expect(state.queue).toEqual([])
    expect(screen.getByText("No hay música en la cola")).toBeInTheDocument()
    expect(player.stopVideo).toHaveBeenCalled()
  })

  it("con la cola vacía espera, y arranca sola cuando un moderador añade una canción", async () => {
    const { state } = playerServer([])
    await openPlayer()
    expect(screen.getByText("No hay música en la cola")).toBeInTheDocument()
    expect(FakePlayer.instances).toHaveLength(0)

    state.queue.push(song(1))
    await tick(2500)

    const player = thePlayer()
    act(() => player.ready())
    expect(player.options.videoId).toBe("v1")
    expect(player.playVideo).toHaveBeenCalled()
    expect(screen.getByText("Canción 1")).toBeInTheDocument()
  })

  it("tras vaciarse la cola, la siguiente canción que llegue vuelve a sonar sola", async () => {
    const { state } = playerServer([song(1)])
    await openPlayer()
    await startPlaying()
    const player = thePlayer()
    act(() => player.emit(STATE.ENDED))
    await tick()
    expect(screen.getByText("No hay música en la cola")).toBeInTheDocument()

    state.queue.push(song(2))
    await tick(2500)

    expect(FakePlayer.instances).toHaveLength(1)
    expect(player.loadVideoById).toHaveBeenCalledWith("v2", 0)
    expect(screen.getByText("Canción 2")).toBeInTheDocument()
  })

  it("si un vídeo no se puede reproducir, avisa y pasa a la siguiente", async () => {
    const { api } = playerServer([song(1), song(2)])
    await openPlayer()
    act(() => thePlayer().ready())

    act(() => thePlayer().fail(150))
    await tick()

    expect(toast.error).toHaveBeenCalledWith(expect.stringContaining("Canción 1"))
    expect(api.to("POST", "/api/player/next")[0].body.queueItemId).toBe("q1")
    expect(thePlayer().loadVideoById).toHaveBeenCalledWith("v2", 0)
    expect(screen.queryByRole("button", { name: "Activar audio" })).not.toBeInTheDocument()
  })

  it("ignora un aviso de fin repetido que llega pegado a la carga de la canción nueva", async () => {
    const { api, state } = playerServer([song(1), song(2), song(3)])
    await openPlayer()
    await startPlaying()

    act(() => thePlayer().emit(STATE.ENDED))
    await tick()
    // YouTube repite el fin de la canción 1 cuando la 2 acaba de cargarse
    act(() => thePlayer().emit(STATE.ENDED))
    await tick()

    expect(api.to("POST", "/api/player/next")).toHaveLength(1)
    expect(state.queue.map((s) => s.queueItemId)).toEqual(["q2", "q3"])
  })

  it("si falla el aviso de fin, lo reintenta en vez de dejar la cola parada", async () => {
    const { api, state } = playerServer([song(1), song(2)])
    await openPlayer()
    await startPlaying()

    state.failNext = true
    act(() => thePlayer().emit(STATE.ENDED))
    await tick()
    expect(state.queue).toHaveLength(2)

    state.failNext = false
    await tick(5000)

    expect(api.to("POST", "/api/player/next")).toHaveLength(2)
    expect(thePlayer().loadVideoById).toHaveBeenCalledWith("v2", 0)
  })

  it("si otro reproductor ya avanzó la canción, carga la que haya ahora", async () => {
    const { state } = playerServer([song(1), song(2), song(3)])
    await openPlayer()
    await startPlaying()

    // Otro reproductor del mismo streamer se adelanta
    state.queue.shift()
    act(() => thePlayer().emit(STATE.ENDED))
    await tick()

    expect(state.queue.map((s) => s.queueItemId)).toEqual(["q2", "q3"])
    expect(thePlayer().loadVideoById).toHaveBeenCalledWith("v2", 0)
    expect(thePlayer().loadVideoById).toHaveBeenCalledTimes(1)
  })

  it("si un moderador quita la canción que suena, pasa a la nueva primera", async () => {
    const { state } = playerServer([song(1), song(2)])
    await openPlayer()
    await startPlaying()

    state.queue.shift()
    await tick(5000)

    expect(thePlayer().loadVideoById).toHaveBeenCalledWith("v2", 0)
    expect(screen.getByText("Canción 2")).toBeInTheDocument()
  })

  it("mientras suena la misma canción, sondear no la reinicia", async () => {
    playerServer([song(1), song(2)])
    await openPlayer()
    await startPlaying()

    await tick(20000)

    expect(FakePlayer.instances).toHaveLength(1)
    expect(thePlayer().loadVideoById).not.toHaveBeenCalled()
    expect(thePlayer().playVideo).toHaveBeenCalledTimes(1)
  })
})

describe("autoplay bloqueado por el navegador", () => {
  it("si la canción no arranca, ofrece activarla con un clic", async () => {
    playerServer([song(1)])
    await openPlayer()
    const player = thePlayer()
    act(() => player.ready())
    expect(screen.queryByRole("button", { name: "Activar audio" })).not.toBeInTheDocument()

    // El navegador bloquea: el estado nunca pasa a "sonando"
    await tick(4500)

    fireEvent.click(screen.getByRole("button", { name: "Activar audio" }))
    expect(player.playVideo).toHaveBeenCalledTimes(2)
    expect(player.muted).toBe(false)

    act(() => player.emit(STATE.PLAYING))
    expect(screen.queryByRole("button", { name: "Activar audio" })).not.toBeInTheDocument()
    expect(screen.getByRole("button", { name: "Pausar" })).toBeInTheDocument()
  })

  it("una pausa que nadie ha pedido justo al arrancar también cuenta como bloqueo", async () => {
    playerServer([song(1)])
    await openPlayer()
    act(() => thePlayer().ready())

    act(() => thePlayer().emit(STATE.PAUSED))

    expect(screen.getByRole("button", { name: "Activar audio" })).toBeInTheDocument()
  })

  it("una red lenta no se confunde con un bloqueo", async () => {
    playerServer([song(1)])
    await openPlayer()
    act(() => thePlayer().ready())
    act(() => thePlayer().emit(STATE.BUFFERING))

    await tick(10000)
    expect(screen.queryByRole("button", { name: "Activar audio" })).not.toBeInTheDocument()

    await tick(11000)
    expect(screen.getByRole("button", { name: "Activar audio" })).toBeInTheDocument()
  })

  it("tras activar el audio una vez, las siguientes canciones suenan sin más clics", async () => {
    playerServer([song(1), song(2)])
    await openPlayer()
    const player = thePlayer()
    act(() => player.ready())
    await tick(4500)
    fireEvent.click(screen.getByRole("button", { name: "Activar audio" }))
    act(() => player.emit(STATE.PLAYING))
    await tick(2000)

    act(() => player.emit(STATE.ENDED))
    await tick()
    act(() => player.emit(STATE.PLAYING))

    expect(player.videoId).toBe("v2")
    expect(screen.queryByRole("button", { name: "Activar audio" })).not.toBeInTheDocument()
  })

  it("con la cola vacía avisa de que hace falta un clic si aún no ha habido ninguno", async () => {
    vi.stubGlobal("navigator", { ...navigator, userActivation: { hasBeenActive: false } })
    playerServer([])
    await openPlayer()

    const button = screen.getByRole("button", { name: "Activar reproducción automática" })
    fireEvent.click(button)

    expect(
      screen.queryByRole("button", { name: "Activar reproducción automática" })
    ).not.toBeInTheDocument()
  })

  it("no molesta con ese aviso si ya se ha interactuado con la página", async () => {
    vi.stubGlobal("navigator", { ...navigator, userActivation: { hasBeenActive: true } })
    playerServer([])
    await openPlayer()

    expect(
      screen.queryByRole("button", { name: "Activar reproducción automática" })
    ).not.toBeInTheDocument()
  })
})

describe("controles", () => {
  it("pausar y reanudar a mano no se trata como un bloqueo", async () => {
    playerServer([song(1)])
    await openPlayer()
    await startPlaying()
    const player = thePlayer()

    fireEvent.click(screen.getByRole("button", { name: "Pausar" }))
    act(() => player.emit(STATE.PAUSED))
    await tick(10000)

    expect(player.pauseVideo).toHaveBeenCalled()
    expect(screen.queryByRole("button", { name: "Activar audio" })).not.toBeInTheDocument()

    fireEvent.click(screen.getByRole("button", { name: "Reproducir" }))
    expect(player.playVideo).toHaveBeenCalledTimes(2)
  })

  it("el botón de saltar pasa a la siguiente canción", async () => {
    const { api } = playerServer([song(1), song(2)])
    await openPlayer()
    await startPlaying()

    fireEvent.click(screen.getByRole("button", { name: "Saltar a la siguiente" }))
    await tick()

    expect(api.to("POST", "/api/player/next")[0].body.queueItemId).toBe("q1")
    expect(screen.getByText("Canción 2")).toBeInTheDocument()
  })

  it("aplica el volumen guardado en la cuenta al abrir", async () => {
    const { state } = playerServer([song(1)])
    state.savedVolume = 35

    await openPlayer()
    act(() => thePlayer().ready())

    expect(thePlayer().volume).toBe(35)
    expect(screen.getByText("35%")).toBeInTheDocument()
  })

  it("con el volumen guardado a 0 arranca silenciado", async () => {
    const { state } = playerServer([song(1)])
    state.savedVolume = 0

    await openPlayer()
    act(() => thePlayer().ready())

    expect(thePlayer().muted).toBe(true)
  })

  it("cambiar el volumen se aplica al momento y se guarda al dejar de moverlo", async () => {
    const { api } = playerServer([song(1)])
    await openPlayer()
    await startPlaying()

    const slider = screen.getByRole("slider", { name: "Volumen" })
    fireEvent.change(slider, { target: { value: "30" } })
    fireEvent.change(slider, { target: { value: "25" } })

    expect(thePlayer().volume).toBe(25)
    expect(api.to("PUT", "/api/player/volume")).toHaveLength(0)

    await tick(800)
    expect(api.to("PUT", "/api/player/volume").map((c) => c.body)).toEqual([{ volume: 25 }])
  })

  it("el botón de silencio silencia y devuelve el sonido", async () => {
    playerServer([song(1)])
    await openPlayer()
    await startPlaying()

    fireEvent.click(screen.getByRole("button", { name: "Silenciar" }))
    expect(thePlayer().muted).toBe(true)

    fireEvent.click(screen.getByRole("button", { name: "Activar sonido" }))
    expect(thePlayer().muted).toBe(false)
    expect(thePlayer().volume).toBe(80)
  })

  it("el volumen elegido se conserva al cambiar de canción", async () => {
    playerServer([song(1), song(2)])
    await openPlayer()
    await startPlaying()
    fireEvent.change(screen.getByRole("slider", { name: "Volumen" }), {
      target: { value: "15" },
    })

    act(() => thePlayer().emit(STATE.ENDED))
    await tick()

    expect(thePlayer().videoId).toBe("v2")
    expect(thePlayer().volume).toBe(15)
  })

  it("la barra de progreso sigue la canción y permite saltar a un punto", async () => {
    playerServer([song(1)])
    await openPlayer()
    await startPlaying()
    const player = thePlayer()
    player.currentTime = 65
    await tick(500)

    expect(screen.getByText("1:05")).toBeInTheDocument()
    expect(screen.getByText("3:20")).toBeInTheDocument()

    const bar = screen.getByRole("slider", { name: "Progreso de la canción" })
    fireEvent.change(bar, { target: { value: "120" } })
    fireEvent.keyUp(bar)

    expect(player.seekTo).toHaveBeenCalledWith(120, true)
  })

  it("alterna entre solo audio y ver el vídeo sin recrear el reproductor", async () => {
    playerServer([song(1)])
    await openPlayer()
    await startPlaying()

    fireEvent.click(screen.getByRole("button", { name: "Ver vídeo" }))
    expect(screen.getByRole("button", { name: "Solo audio" })).toBeInTheDocument()

    expect(FakePlayer.instances).toHaveLength(1)
    expect(thePlayer().destroy).not.toHaveBeenCalled()
  })
})

describe("información y navegación", () => {
  it("muestra quién pidió la canción y cuántas quedan", async () => {
    playerServer([song(1, { requesterName: "pepe" }), song(2), song(3)])
    await openPlayer()

    expect(screen.getByText("Pedido por pepe · 2 más en la cola")).toBeInTheDocument()
  })

  it("cuenta las que quedan en singular y en plural", async () => {
    const { state } = playerServer([song(1), song(2), song(3)])
    await openPlayer()
    expect(screen.getByText("2 canciones más en la cola")).toBeInTheDocument()

    state.queue.pop()
    await tick(5000)
    expect(screen.getByText("1 canción más en la cola")).toBeInTheDocument()
  })

  it("indica cuándo es la última de la cola", async () => {
    playerServer([song(1)])
    await openPlayer()

    expect(screen.getByText("No hay más canciones en la cola")).toBeInTheDocument()
  })

  it("un streamer ve de quién es la cola, sin selector", async () => {
    playerServer([song(1)])
    await openPlayer()

    expect(screen.getByText("directo")).toBeInTheDocument()
    expect(screen.queryByRole("combobox")).not.toBeInTheDocument()
  })

  it("admin y mod pueden saltar al reproductor de otro streamer", async () => {
    playerServer([song(1)])
    await openPlayer([STREAMER, { id: "s2", username: "otra" }])

    fireEvent.change(screen.getByRole("combobox"), { target: { value: "s2" } })

    expect(router.push).toHaveBeenCalledWith("/player?streamer=s2")
  })

  it("si la sesión ha caducado, manda al login", async () => {
    const { state } = playerServer([song(1)])
    state.unauthorized = true

    await openPlayer()

    expect(router.replace).toHaveBeenCalledWith("/login?callbackUrl=/player")
  })

  it("si el servidor falla, avisa una sola vez aunque siga fallando", async () => {
    mockApi(() => ({ status: 500, text: "<html>Error interno</html>" }))

    await openPlayer()
    await tick(10000)

    expect(toast.error).toHaveBeenCalledTimes(1)
    expect(toast.error).toHaveBeenCalledWith(expect.stringContaining("500"))
  })

  it("al salir de la página destruye el reproductor", async () => {
    playerServer([song(1)])
    const { unmount } = render(<Player streamer={STREAMER} streamers={[]} />)
    await tick()
    const player = thePlayer()

    unmount()

    expect(player.destroy).toHaveBeenCalled()
  })
})
