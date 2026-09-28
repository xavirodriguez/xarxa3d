#!/usr/bin/env node
/**
 * Descarga y cachea localmente SOLO las teselas ICGC (DEM Terrain-RGB + basemap)
 * que cubren la red de transporte definida en core/infrastructure/data/barcelona.ts,
 * en vez de depender de un tile server en tiempo real que serviría toda Catalunya.
 *
 * Uso:
 *   node scripts/fetch-terrain-tiles.mjs
 *   node scripts/fetch-terrain-tiles.mjs --zoom 16 --buffer 2000
 *
 * Datos: © Institut Cartogràfic i Geològic de Catalunya (ICGC), CC BY 4.0.
 * Si publicas la app, hay que mostrar la atribución en la UI (ver ATTRIBUTION más abajo).
 */

import { readFileSync, mkdirSync, existsSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const ROOT = join(__dirname, '..')

const args = Object.fromEntries(
  process.argv.slice(2).reduce((pairs, arg, i, arr) => {
    if (arg.startsWith('--')) pairs.push([arg.slice(2), arr[i + 1]])
    return pairs
  }, []),
)

const ZOOM = Number(args.zoom ?? 15) // ~3.6 m/px en Barcelona: encaja con el DEM nativo de 5 m
const BUFFER_METERS = Number(args.buffer ?? 1500)
const CONCURRENCY = Number(args.concurrency ?? 8)

const LAYERS = {
  dem: {
    url: (z, x, y) => `https://geoserveis.icgc.cat/servei/catalunya/contextmaps-terreny-5m-rgb/wmts/${z}/${x}/${y}.png`,
    outDir: join(ROOT, 'public/terrain/dem'),
  },
  basemap: {
    url: (z, x, y) =>
      `https://geoserveis.icgc.cat/servei/catalunya/mapa-base/wmts/topografic-gris/MON3857NW/${z}/${x}/${y}.png`,
    outDir: join(ROOT, 'public/terrain/basemap'),
  },
}

// --- 1. Bbox real a partir de las estaciones del dominio (nunca a partir de todo Catalunya) ---

function readNetworkBounds() {
  const fileCandidates = [
    join(ROOT, 'core/infrastructure/data/barcelona-generated.ts'),
    join(ROOT, 'core/infrastructure/data/barcelona.ts'),
  ]

  const lats = []
  const lons = []

  for (const filePath of fileCandidates) {
    if (existsSync(filePath)) {
      const src = readFileSync(filePath, 'utf8')
      const re = /"lat":\s*(-?\d+(?:\.\d+)?),\s*"lon":\s*(-?\d+(?:\.\d+)?)|lat:\s*(-?\d+(?:\.\d+)?),\s*lon:\s*(-?\d+(?:\.\d+)?)/g
      let m
      while ((m = re.exec(src))) {
        const lat = m[1] ?? m[3]
        const lon = m[2] ?? m[4]
        if (lat && lon) {
          lats.push(Number.parseFloat(lat))
          lons.push(Number.parseFloat(lon))
        }
      }
      if (lats.length > 0) break
    }
  }

  if (lats.length === 0) throw new Error('No se encontraron estaciones en los archivos de datos de la red')
  return {
    minLat: Math.min(...lats),
    maxLat: Math.max(...lats),
    minLon: Math.min(...lons),
    maxLon: Math.max(...lons),
    count: lats.length,
  }
}

function bufferBounds(bounds, meters) {
  const midLat = (bounds.minLat + bounds.maxLat) / 2
  const dLat = meters / 111_320
  const dLon = meters / (111_320 * Math.cos((midLat * Math.PI) / 180))
  return {
    minLat: bounds.minLat - dLat,
    maxLat: bounds.maxLat + dLat,
    minLon: bounds.minLon - dLon,
    maxLon: bounds.maxLon + dLon,
  }
}

// --- 2. Bbox -> rango de teselas XYZ (Web Mercator estándar) ---

const lon2tile = (lon, z) => Math.floor(((lon + 180) / 360) * 2 ** z)
const lat2tile = (lat, z) => {
  const rad = (lat * Math.PI) / 180
  return Math.floor(((1 - Math.log(Math.tan(rad) + 1 / Math.cos(rad)) / Math.PI) / 2) * 2 ** z)
}

function tileRange(bbox, z) {
  return {
    z,
    xMin: lon2tile(bbox.minLon, z),
    xMax: lon2tile(bbox.maxLon, z),
    yMin: lat2tile(bbox.maxLat, z), // maxLat -> yMin porque el origen de la tesela es NW
    yMax: lat2tile(bbox.minLat, z),
  }
}

// --- 3. Descarga con caché (si el archivo ya existe, no se vuelve a pedir) ---

async function fetchTile(layerId, layer, z, x, y) {
  const outPath = join(layer.outDir, String(z), String(x), `${y}.png`)
  if (existsSync(outPath)) return { skipped: true }

  const res = await fetch(layer.url(z, x, y))
  if (!res.ok) return { error: `${res.status} ${res.statusText}` }

  mkdirSync(dirname(outPath), { recursive: true })
  writeFileSync(outPath, Buffer.from(await res.arrayBuffer()))
  return { downloaded: true }
}

async function runPool(tasks, concurrency) {
  let cursor = 0
  let ok = 0
  let skipped = 0
  let failed = 0

  async function worker() {
    while (cursor < tasks.length) {
      const task = tasks[cursor++]
      const result = await task().catch((e) => ({ error: String(e) }))
      if (result.error) {
        failed++
        console.warn(`  ✗ ${result.error}`)
      } else if (result.skipped) skipped++
      else ok++
    }
  }

  await Promise.all(Array.from({ length: concurrency }, worker))
  return { ok, skipped, failed }
}

// --- main ---

async function main() {
  const rawBounds = readNetworkBounds()
  const bbox = bufferBounds(rawBounds, BUFFER_METERS)

  console.log(`Red: ${rawBounds.count} estaciones`)
  console.log(`Bbox (+${BUFFER_METERS} m): ${bbox.minLat.toFixed(4)},${bbox.minLon.toFixed(4)} -> ${bbox.maxLat.toFixed(4)},${bbox.maxLon.toFixed(4)}`)

  for (const [layerId, layer] of Object.entries(LAYERS)) {
    const range = tileRange(bbox, ZOOM)
    const cols = range.xMax - range.xMin + 1
    const rows = range.yMax - range.yMin + 1
    console.log(`\n[${layerId}] z=${ZOOM} x[${range.xMin}-${range.xMax}] y[${range.yMin}-${range.yMax}] -> ${cols * rows} teselas`)

    const tasks = []
    for (let x = range.xMin; x <= range.xMax; x++) {
      for (let y = range.yMin; y <= range.yMax; y++) {
        tasks.push(() => fetchTile(layerId, layer, ZOOM, x, y))
      }
    }

    const { ok, skipped, failed } = await runPool(tasks, CONCURRENCY)
    console.log(`  descargadas: ${ok} · en caché: ${skipped} · fallidas: ${failed}`)
  }

  writeFileSync(
    join(ROOT, 'public/terrain/manifest.json'),
    JSON.stringify({ zoom: ZOOM, bbox, generatedAt: new Date().toISOString(), attribution: '© Institut Cartogràfic i Geològic de Catalunya (CC BY 4.0)' }, null, 2),
  )
  console.log('\nListo. Este bbox/zoom queda registrado en public/terrain/manifest.json — vuelve a ejecutar el script si cambia la red (nuevas estaciones fuera del área actual).')
}

main()
