#!/usr/bin/env python3
"""Genera el fondo monocromo del proyecto.

Toma una carpeta de imagenes y las deja en blanco y negro puro con umbral
adaptativo (mas detalle que un corte global, que dejaba manchas planas). Luego,
con `vtracer`, una sola imagen queda como fondo unico y varias se reparten en un
tile que se repite sin costuras (`public/art/manga-tile.svg`). Con `--raster` se
salta la vectorizacion y se guarda un PNG (para comparar).

Uso:
    python3 scripts/build-art.py [carpeta] [--out ruta]
    python3 scripts/build-art.py [carpeta] --raster

Requisitos:
    - ImageMagick 7 (`magick`) en el PATH.
    - vtracer de Python (`pip install vtracer`).
"""

from __future__ import annotations

import argparse
import math
import os
import random
import re
import subprocess
import sys
import tempfile

import vtracer

SRC_DEFAULT = "../manga"
OUT_DEFAULT = "public/art/manga-tile.svg"
RASTER_DEFAULT = "public/art/manga-art.png"

IMG_EXTS = (".jpg", ".jpeg", ".png", ".webp", ".bmp", ".gif", ".tif", ".tiff")

# Lado del tile del SVG (el tamano en pantalla lo fija --art-tile-size).
TILE = 720
# Tamano base de cada figura: mas imagenes = mas pequenas (TILE / sqrt(n)).
SIZE_FACTOR = 0.72
# Cuanto pueden moverse las figuras de su celda (rompe la sensacion de rejilla).
JITTER = 0.18
# Variacion de tamano y semilla del reparto (fijo = resultado reproducible).
SIZE_SPREAD = 0.15
SEED = 20241014
# Lado maximo al que se vectoriza (en px). Mas grande = mas detalle y mas peso.
TRACE_SIZE = 1000
# Umbral adaptativo local (ventana x ventana + margen): en vez de un corte
# global (que dejaba manchas planas), cada zona se umbraliza contra su entorno,
# asi las zonas oscuras conservan textura y detalle.
LAT_BASE = 20
LAT_OFFSET = "3%"
LAT_WINDOW = f"{LAT_BASE}x{LAT_BASE}+{LAT_OFFSET}"
# PNG raster (sin vectorizar): resolucion de salida, factor de supersample
# (bordes suaves al reducir) y bits por canal (menos peso).
RASTER_SIZE = 1920
RASTER_SS = 2
RASTER_DEPTH = 4


def preprocess(src: str, dst: str) -> None:
    """Imagen -> PNG binario (negro sobre blanco) con umbral adaptativo."""
    subprocess.run(
        [
            "magick",
            src,
            "-auto-orient",
            "-colorspace",
            "Gray",
            "-resize",
            f"{TRACE_SIZE}x{TRACE_SIZE}>",
            "-lat",
            LAT_WINDOW,
            "+repage",
            dst,
        ],
        check=True,
    )


def trace(png: str, svg: str) -> None:
    """Vectoriza en blanco y negro puro (silueta binaria)."""
    vtracer.convert_image_to_svg_py(
        png,
        svg,
        colormode="binary",
        hierarchical="stacked",
        mode="polygon",
        filter_speckle=3,
        corner_threshold=60,
        length_threshold=6.0,
        path_precision=1,
    )


def split_svg(svg: str) -> tuple[float, float, str]:
    """Devuelve (ancho, alto, contenido interno) de un SVG de vtracer."""
    text = open(svg, encoding="utf-8").read()
    match = re.search(
        r'<svg[^>]*?\bwidth="([\d.]+)"[^>]*?\bheight="([\d.]+)"', text
    )
    if not match:
        raise ValueError(f"SVG sin width/height: {svg}")
    width, height = float(match.group(1)), float(match.group(2))
    inner = text[text.index(">", text.index("<svg")) + 1 : text.rindex("</svg>")]
    return width, height, inner


def placements(count: int) -> list[tuple[float, float, float, bool]]:
    """Reparte `count` figuras: devuelve (x, y, alto, espejada) por figura.

    Es determinista (misma semilla): el mismo numero de imagenes da siempre el
    mismo reparto, asi el SVG no cambia entre builds.
    """
    rng = random.Random(SEED)
    cols = math.ceil(math.sqrt(count))
    rows = math.ceil(count / cols)
    cell_w = TILE / cols
    cell_h = TILE / rows
    base = TILE * SIZE_FACTOR / math.sqrt(count)

    result: list[tuple[float, float, float, bool]] = []
    for index in range(count):
        col = index % cols
        row = index // cols
        height = base * (1 + rng.uniform(-SIZE_SPREAD, SIZE_SPREAD))
        cx = (col + 0.5) * cell_w + (rng.random() * 2 - 1) * cell_w * JITTER
        cy = (row + 0.5) * cell_h + (rng.random() * 2 - 1) * cell_h * JITTER
        result.append((cx, cy, height, index % 2 == 1))
    return result


def build_tile(drawings: list[tuple[float, float, str]]) -> str:
    """Reparte los dibujos en un tile repetible (negro sobre transparente)."""
    layout = placements(len(drawings))
    parts: list[str] = []

    for (width, height, inner), (cx, cy, target, mirrored) in zip(drawings, layout):
        scale = target / height
        draw_w = width * scale
        draw_h = height * scale
        x = cx - draw_w / 2
        y = cy - draw_h / 2

        body = inner.strip()
        if mirrored:
            body = f'<g transform="translate({width:.1f} 0) scale(-1 1)">{body}</g>'

        # Copias desplazadas un tile para que las figuras crucen los bordes sin
        # dejar costura al repetir.
        for dx in (-1, 0, 1):
            for dy in (-1, 0, 1):
                px = x + dx * TILE
                py = y + dy * TILE
                if px + draw_w <= 0 or px >= TILE:
                    continue
                if py + draw_h <= 0 or py >= TILE:
                    continue
                parts.append(
                    f'<g transform="translate({px:.1f} {py:.1f}) '
                    f'scale({scale:.4f})">{body}</g>'
                )

    body = "\n".join(parts)
    return (
        '<?xml version="1.0" encoding="UTF-8"?>\n'
        f'<svg xmlns="http://www.w3.org/2000/svg" width="{TILE}" '
        f'height="{TILE}" viewBox="0 0 {TILE} {TILE}">\n'
        f"{body}\n</svg>\n"
    )


def preprocess_raster(src: str, dst: str) -> None:
    """Igual que `preprocess` pero sin vectorizar: PNG en negro sobre transparente.

    Se genera a `RASTER_SIZE` con supersample (`RASTER_SS`) y se reduce, con lo
    que los bordes quedan suavizados (anti-alias) en vez de a bloques.
    """
    big = RASTER_SIZE * RASTER_SS
    window = max(9, round(LAT_BASE * big / TRACE_SIZE))
    subprocess.run(
        [
            "magick",
            src,
            "-auto-orient",
            "-colorspace",
            "Gray",
            "-resize",
            f"{big}x{big}",
            "-lat",
            f"{window}x{window}+{LAT_OFFSET}",
            "-resize",
            f"{RASTER_SIZE}x{RASTER_SIZE}>",
            "-negate",
            "-alpha",
            "copy",
            "-depth",
            str(RASTER_DEPTH),
            "-define",
            "png:compression-level=9",
            "-strip",
            dst,
        ],
        check=True,
    )


def single(drawing: tuple[float, float, str]) -> str:
    """Con una sola imagen, devuelve su SVG tal cual (sin patron)."""
    width, height, inner = drawing
    return (
        '<?xml version="1.0" encoding="UTF-8"?>\n'
        f'<svg xmlns="http://www.w3.org/2000/svg" width="{width:.0f}" '
        f'height="{height:.0f}" viewBox="0 0 {width:.0f} {height:.0f}">\n'
        f"{inner.strip()}\n</svg>\n"
    )


def main() -> int:
    parser = argparse.ArgumentParser(description="Genera el fondo vectorial.")
    parser.add_argument("src", nargs="?", default=SRC_DEFAULT, help="carpeta de imagenes")
    parser.add_argument("--out", default=OUT_DEFAULT, help="archivo de salida")
    parser.add_argument(
        "--raster",
        action="store_true",
        help="salida PNG sin vectorizar (para comparar; solo con una imagen)",
    )
    args = parser.parse_args()

    if not os.path.isdir(args.src):
        print(f"No existe la carpeta: {args.src}", file=sys.stderr)
        return 1

    files = sorted(
        name for name in os.listdir(args.src) if name.lower().endswith(IMG_EXTS)
    )
    if not files:
        print(f"Sin imagenes en: {args.src}", file=sys.stderr)
        return 1

    if args.raster:
        if len(files) != 1:
            print("--raster solo admite una imagen.", file=sys.stderr)
            return 1
        out = args.out if args.out != OUT_DEFAULT else RASTER_DEFAULT
        preprocess_raster(os.path.join(args.src, files[0]), out)
        size_kb = os.path.getsize(out) / 1024
        print(f"\n{out}  ({size_kb:.0f} KB, PNG sin vectorizar)")
        return 0

    drawings: list[tuple[float, float, str]] = []
    with tempfile.TemporaryDirectory() as tmp:
        for index, name in enumerate(files):
            png = os.path.join(tmp, f"{index:02d}.png")
            svg = os.path.join(tmp, f"{index:02d}.svg")
            preprocess(os.path.join(args.src, name), png)
            trace(png, svg)
            width, height, inner = split_svg(svg)
            drawings.append((width, height, inner))
            print(f"  {index + 1:02d} {name}  ({width:.0f}x{height:.0f})")

    composed = single(drawings[0]) if len(drawings) == 1 else build_tile(drawings)
    os.makedirs(os.path.dirname(args.out), exist_ok=True)
    with open(args.out, "w", encoding="utf-8") as handle:
        handle.write(composed)

    size_kb = os.path.getsize(args.out) / 1024
    kind = "imagen unica" if len(drawings) == 1 else f"patron {TILE}px"
    print(f"\n{args.out}  ({size_kb:.0f} KB, {kind}, {len(drawings)} dibujos)")


if __name__ == "__main__":
    raise SystemExit(main())
