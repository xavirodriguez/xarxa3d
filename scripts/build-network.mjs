import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const rootDir = path.join(__dirname, '..')

const estacionsPath = path.join(rootDir, 'data', 'estacions.json')
const recorregutsPath = path.join(rootDir, 'data', 'recorreguts.json')
const outputPath = path.join(rootDir, 'core', 'infrastructure', 'data', 'barcelona-generated.ts')

console.log('Reading input GeoJSON files...')
const estacionsGeoJSON = JSON.parse(fs.readFileSync(estacionsPath, 'utf8'))
const recorregutsGeoJSON = JSON.parse(fs.readFileSync(recorregutsPath, 'utf8'))

function slugify(text) {
  return text
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

function haversineMeters(lon1, lat1, lon2, lat2) {
  const R = 6371e3
  const phi1 = (lat1 * Math.PI) / 180
  const phi2 = (lat2 * Math.PI) / 180
  const dphi = ((lat2 - lat1) * Math.PI) / 180
  const dlambda = ((lon2 - lon1) * Math.PI) / 180
  const a =
    Math.sin(dphi / 2) ** 2 + Math.cos(phi1) * Math.cos(phi2) * Math.sin(dlambda / 2) ** 2
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
}

function totalDist(path) {
  let d = 0
  for (let i = 0; i < path.length - 1; i++) {
    d += haversineMeters(path[i].lon, path[i].lat, path[i + 1].lon, path[i + 1].lat)
  }
  return d
}

function optimizePath2Opt(stations) {
  let best = [...stations]
  let improved = true
  while (improved) {
    improved = false;
    for (let i = 0; i < best.length - 1; i++) {
      for (let j = i + 1; j < best.length; j++) {
        const newPath = [
          ...best.slice(0, i),
          ...best.slice(i, j + 1).reverse(),
          ...best.slice(j + 1),
        ]
        if (totalDist(newPath) < totalDist(best)) {
          best = newPath
          improved = true
        }
      }
    }
  }
  return best
}

function orderStationsNN2Opt(stations) {
  if (stations.length <= 1) return stations

  let maxDist = -1
  let startIdx = 0
  for (let i = 0; i < stations.length; i++) {
    for (let j = i + 1; j < stations.length; j++) {
      const d = haversineMeters(stations[i].lon, stations[i].lat, stations[j].lon, stations[j].lat)
      if (d > maxDist) {
        maxDist = d
        startIdx = stations[i].lon <= stations[j].lon ? i : j
      }
    }
  }

  const unvisited = [...stations]
  const ordered = [unvisited.splice(startIdx, 1)[0]]
  while (unvisited.length > 0) {
    let bestIdx = 0
    let minD = Infinity
    for (let i = 0; i < unvisited.length; i++) {
      const d = haversineMeters(
        ordered[ordered.length - 1].lon,
        ordered[ordered.length - 1].lat,
        unvisited[i].lon,
        unvisited[i].lat,
      )
      if (d < minD) {
        minD = d
        bestIdx = i
      }
    }
    ordered.push(unvisited.splice(bestIdx, 1)[0])
  }

  return optimizePath2Opt(ordered)
}

function projectPointToSegment(px, py, ax, ay, bx, by) {
  const dx = bx - ax
  const dy = by - ay
  if (dx === 0 && dy === 0) return { x: ax, y: ay, t: 0 }
  const t = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / (dx * dx + dy * dy)))
  return { x: ax + t * dx, y: ay + t * dy, t }
}

function orderStationsByPolyline(stations, lineFeature) {
  const geom = lineFeature.geometry
  const coordsList = geom.type === 'MultiLineString' ? geom.coordinates : [geom.coordinates]

  // Flatten segments with cumulative distance along line
  let segments = []
  let accumulatedDist = 0
  for (const lineCoords of coordsList) {
    for (let i = 0; i < lineCoords.length - 1; i++) {
      const [ax, ay] = lineCoords[i]
      const [bx, by] = lineCoords[i + 1]
      const segLen = haversineMeters(ax, ay, bx, by)
      segments.push({ ax, ay, bx, by, startDist: accumulatedDist, segLen })
      accumulatedDist += segLen
    }
  }

  const stationsWithDist = stations.map((st) => {
    let minDist = Infinity
    let bestPosOnLine = 0
    for (const seg of segments) {
      const proj = projectPointToSegment(st.lon, st.lat, seg.ax, seg.ay, seg.bx, seg.by)
      const distToSeg = haversineMeters(st.lon, st.lat, proj.x, proj.y)
      if (distToSeg < minDist) {
        minDist = distToSeg
        bestPosOnLine = seg.startDist + proj.t * seg.segLen
      }
    }
    return { station: st, pos: bestPosOnLine }
  })

  stationsWithDist.sort((a, b) => a.pos - b.pos)
  return stationsWithDist.map((s) => s.station)
}

// 1. Process Stations and Deduplicate by CODI_GRUP_ESTACIO
const stationByGroup = new Map()
const seenIds = new Map()

const lineRegex = /(L10N|L10S|L9N|L9S|L11|L1|L2|L3|L4|L5|L6|L7|L8|FM|TM|S[1-9]\d*|R[1-9]\d*|T[1-9]\d*)/g

const lineStationsMap = new Map() // lineCode -> array of station objects

for (const feature of estacionsGeoJSON.features) {
  const props = feature.properties
  const codiGrup = props.CODI_GRUP_ESTACIO
  const rawName = props.NOM_ESTACIO || 'Estació'
  const [lon, lat] = feature.geometry.coordinates

  if (!stationByGroup.has(codiGrup)) {
    let id = slugify(rawName)
    if (seenIds.has(id) && seenIds.get(id) !== rawName) {
      let suffix = 2
      while (seenIds.has(`${id}-${suffix}`)) suffix++
      id = `${id}-${suffix}`
    }
    seenIds.set(id, rawName)

    const stationObj = { id, name: rawName, lat, lon }
    stationByGroup.set(codiGrup, stationObj)
  }

  const station = stationByGroup.get(codiGrup)

  const picto = props.PICTO || ''
  const matches = picto.match(lineRegex) || []
  const uniqueLines = Array.from(new Set(matches))

  for (const lCode of uniqueLines) {
    if (!lineStationsMap.has(lCode)) lineStationsMap.set(lCode, [])
    const list = lineStationsMap.get(lCode)
    if (!list.some((s) => s.id === station.id)) {
      list.push(station)
    }
  }
}

const stationsArray = Array.from(stationByGroup.values()).sort((a, b) =>
  a.name.localeCompare(b.name, 'ca'),
)

console.log(`Deduplicated ${stationsArray.length} stations from GeoJSON.`)

// 2. Line Metadata definition
const LINE_METADATA = {
  L1: { name: 'Hospital de Bellvitge – Fondo', mode: 'metro', color: '#E2231A', depthMeters: -14, cruiseSpeedMps: 9.5 },
  L2: { name: 'Paral·lel – Badalona Pompeu Fabra', mode: 'metro', color: '#9B2B8E', depthMeters: -26, cruiseSpeedMps: 9.5 },
  L3: { name: 'Zona Universitària – Trinitat Nova', mode: 'metro', color: '#2E9E48', depthMeters: -18, cruiseSpeedMps: 9.5 },
  L4: { name: 'Trinitat Nova – La Pau', mode: 'metro', color: '#F2B705', depthMeters: -22, cruiseSpeedMps: 9.5 },
  L5: { name: 'Cornellà Centre – Vall d’Hebron', mode: 'metro', color: '#0072BC', depthMeters: -32, cruiseSpeedMps: 9.5 },
  L9N: { name: 'La Sagrera – Can Zam', mode: 'metro', color: '#E65100', depthMeters: -40, cruiseSpeedMps: 10.0 },
  L9S: { name: 'Aeroport T1 – Zona Universitària', mode: 'metro', color: '#E65100', depthMeters: -40, cruiseSpeedMps: 10.0 },
  L10N: { name: 'La Sagrera – Gorg', mode: 'metro', color: '#00A099', depthMeters: -40, cruiseSpeedMps: 10.0 },
  L10S: { name: 'ZAL | Riu Vell – Collblanc', mode: 'metro', color: '#00A099', depthMeters: -40, cruiseSpeedMps: 10.0 },
  L11: { name: 'Trinitat Nova – Can Cuiàs', mode: 'metro', color: '#B2D235', depthMeters: -15, cruiseSpeedMps: 8.0 },
  FM: { name: 'Funicular de Montjuïc', mode: 'funicular', color: '#5FA33A', depthMeters: -20, cruiseSpeedMps: 2.5 },
  TM: { name: 'Telefèric de Montjuïc', mode: 'funicular', color: '#888888', depthMeters: 10, cruiseSpeedMps: 2.5 },
}

// 3. Process Lines and Order Stations
const linesArray = []

for (const [lineCode, stns] of lineStationsMap.entries()) {
  if (stns.length < 2) {
    console.log(`Line ${lineCode}: less than 2 stations (${stns.length}). Skipping line.`)
    continue
  }

  const recFeature = recorregutsGeoJSON.features.find(
    (f) => f.properties.NOM_LINIA === lineCode || f.properties.CODI_LINIA === lineCode,
  )

  let orderedStations
  if (recFeature) {
    console.log(`Line ${lineCode}: found in recorreguts.json. Ordering by polyline projection.`)
    orderedStations = orderStationsByPolyline(stns, recFeature)
  } else {
    console.log(
      `Line ${lineCode}: NOT found in recorreguts.json. Ordering by nearest-neighbor + 2-opt open TSP chaining.`,
    )
    orderedStations = orderStationsNN2Opt(stns)
  }

  const stationIds = orderedStations.map((s) => s.id)
  const meta = LINE_METADATA[lineCode] || {}
  const firstName = orderedStations[0]?.name || ''
  const lastName = orderedStations[orderedStations.length - 1]?.name || ''
  const defaultName = firstName && lastName && firstName !== lastName ? `${firstName} – ${lastName}` : lineCode

  linesArray.push({
    id: lineCode,
    code: lineCode,
    name: meta.name || defaultName,
    mode: meta.mode || 'metro',
    color: meta.color || '#888888',
    depthMeters: meta.depthMeters ?? -20,
    cruiseSpeedMps: meta.cruiseSpeedMps ?? 9.5,
    stations: stationIds,
  })
}

// Sort lines deterministically: L1..L11, FM, TM, etc.
linesArray.sort((a, b) => a.id.localeCompare(b.id, 'en', { numeric: true }))

const compactNetwork = {
  id: 'bcn-generated',
  name: 'Barcelona · Red real completa',
  defaultTransfer: { seconds: 180, meters: 120, accessibility: 'partial' },
  stations: stationsArray,
  lines: linesArray,
  transfers: [],
}

const fileContent = `// Auto-generated by scripts/build-network.mjs from data/estacions.json and data/recorreguts.json
// Note: recorreguts.json contains bus route polylines. Metro/train lines not found in recorreguts.json
// are topologically ordered using nearest-neighbor + 2-opt open TSP path optimization.

import type { CompactNetwork } from '../import/compact-importer'

export const barcelonaCompact: CompactNetwork = ${JSON.stringify(compactNetwork, null, 2)}
`

fs.writeFileSync(outputPath, fileContent, 'utf8')
console.log(`Successfully generated ${outputPath}`)
console.log(`Summary: ${stationsArray.length} stations, ${linesArray.length} lines.`)
