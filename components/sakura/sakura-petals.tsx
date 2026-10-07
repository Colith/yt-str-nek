"use client"

import { useEffect, useState } from "react"

interface Petal {
  id: number
  left: number
  size: number
  duration: number
  delay: number
  drift: number
  rotation: number
  opacity: number
}

const PETAL_COUNT = 20

/** Genera los pétalos una sola vez con valores aleatorios estables. */
function generatePetals(isDark: boolean): Petal[] {
  return Array.from({ length: PETAL_COUNT }, (_, i) => ({
    id: i,
    left: Math.random() * 100,
    size: 8 + Math.random() * 10,
    duration: 12 + Math.random() * 6,
    delay: Math.random() * 12,
    drift: (Math.random() - 0.5) * 120,
    rotation: Math.random() * 360,
    opacity: isDark ? 0.25 + Math.random() * 0.25 : 0.4 + Math.random() * 0.3,
  }))
}

export function SakuraPetals() {
  const [petals, setPetals] = useState<Petal[]>(() =>
    generatePetals(false)
  )

  useEffect(() => {
    const observer = new MutationObserver(() => {
      const dark = document.documentElement.classList.contains("dark")
      setPetals(generatePetals(dark))
    })
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["class"],
    })

    return () => observer.disconnect()
  }, [])

  return (
    <div aria-hidden="true" className="pointer-events-none fixed inset-0 z-0 overflow-hidden">
      {petals.map((petal) => (
        <span
          key={petal.id}
          className="petal absolute top-[-5%]"
          style={{
            left: `${petal.left}%`,
            width: `${petal.size}px`,
            height: `${petal.size}px`,
            opacity: petal.opacity,
            background: "var(--petal-color)",
            animationDuration: `${petal.duration}s`,
            animationDelay: `${petal.delay}s`,
            ["--drift" as string]: `${petal.drift}px`,
            ["--rot" as string]: `${petal.rotation}deg`,
          }}
        />
      ))}
    </div>
  )
}