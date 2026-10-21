import { readFileSync } from "node:fs"
import { resolve } from "node:path"
import { render, screen } from "@testing-library/react"
import { describe, expect, it } from "vitest"
import { Wordmark } from "@/components/layout/wordmark"

const CSS = readFileSync(resolve(process.cwd(), "app/globals.css"), "utf8")

describe("logotipo", () => {
  it("es el nombre de la página, en latín y en japonés", () => {
    render(<Wordmark />)

    expect(screen.getByText("Sakura Ryū")).toBeInTheDocument()
    expect(screen.getByText("桜龍")).toBeInTheDocument()
  })

  it("el nombre japonés se marca como japonés, para que se lea así", () => {
    render(<Wordmark />)

    expect(screen.getByText("桜龍")).toHaveAttribute("lang", "ja")
  })

  it("el tamaño lo pone quien lo usa", () => {
    const { container } = render(<Wordmark className="text-3xl" />)

    expect(container.firstChild).toHaveClass("text-3xl")
  })

  it("cada versión lleva su tipografía", () => {
    render(<Wordmark />)

    expect(screen.getByText("Sakura Ryū")).toHaveClass("font-display")
    expect(screen.getByText("桜龍")).toHaveClass("font-jp-display")
  })

  it("no lleva flor: el logotipo es solo el nombre", () => {
    const { container } = render(<Wordmark />)

    expect(container.querySelector("svg")).toBeNull()
  })
})

describe("el logotipo cambia con el modo", () => {
  it("en modo normal se ve el latín", () => {
    expect(CSS).toMatch(/\.wordmark-jp\s*\{\s*display:\s*none/)
  })

  it("en modo otaku se ve el japonés", () => {
    expect(CSS).toMatch(
      /html\[data-art="otaku"\]\s+\.wordmark-latin\s*\{\s*display:\s*none/
    )
    expect(CSS).toMatch(
      /html\[data-art="otaku"\]\s+\.wordmark-jp\s*\{\s*display:\s*inline/
    )
  })

  it("las dos versiones van escritas a mano", () => {
    expect(CSS).toMatch(/--font-display:\s*var\(--font-kaushan\)/)
    expect(CSS).toMatch(/--font-jp-display:\s*var\(--font-yomogi\)/)
  })

  it("las letras japonesas llevan un pelo de trazo, para que se lean bien", () => {
    expect(CSS).toMatch(
      /html\[data-art="otaku"\]\s+\.wordmark-jp\s*\{[^}]*-webkit-text-stroke/
    )
  })
})
