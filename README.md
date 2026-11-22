# Onde de soins

Interactive map of medical deserts: real driving times to the nearest maternity ward,
emergency room or general practitioner. Demo department: **Nièvre (58)**, France.

Everything is free — no API key, no account, no credit card required.

## Free by default

The default routing engine is **Valhalla (FOSSGIS / OpenStreetMap public demo)**. It provides
**real** driving matrices and isochrones (`driving-car` / costing `auto`) with no API key. The
public API is a community-funded common good: the proxy sends an `X-Client-Id` header, caches
responses for 6 hours and spaces out precompute requests. For heavy or commercial use, self-host
Valhalla (see below) — also free and open source.

OpenRouteService remains supported **if you already have a key**: set `ORS_API_KEY` and the proxy
uses it first, with automatic fallback to Valhalla on failure. No secret is needed to start.

## Stack

- Vite + React + TypeScript
- MapLibre GL JS with the OpenFreeMap **liberty** vector style (no key)
- deck.gl `MapboxOverlay({ interleaved: true })`, with `beforeId` set just before the first road
  layer of the style, so roads, labels and fields stay above the colour overlay
- **Valhalla FOSSGIS** (`/sources_to_targets`, `/isochrone`) as the free default; OpenRouteService
  optional
- Turf.js for unions, differences, ring splitting and point-in-polygon tests

> Rendering note: layers are alpha-composited at 0.62 (adjustable via the slider) rather than
> using hardware multiply. deck.gl 9.1's interleaved pipeline does not accept a `DST_COLOR`
> blend factor; alpha compositing gives the same visual result while keeping fields, forests and
> buildings readable.

## Setup

```bash
npm install
cp .env.example .env   # optional: no variables are required
npm run dev
```

The pre-generated GeoJSON files committed in `public/data/` make the map coloured immediately.
Live clicks and the simulation call the free proxy on demand.

| Command | Purpose |
| --- | --- |
| `npm run dev` | development server |
| `npm run build` | typecheck + production build |
| `npm run typecheck` | TypeScript only |
| `npm run lint` | ESLint |
| `npm run data:fetch` | fetch boundary, communes and facilities |
| `npm run precompute` | precompute coverage layers |
| `npm run start:prod` | standalone Node server serving `dist/` and the proxy |

## Data

| Data | Source | Use |
| --- | --- | --- |
| Facilities | FINESS / DREES (2024 maternity list), OpenStreetMap via Overpass (hospitals, ER, GPs) | care points, including neighbouring departments within ~60 km |
| Population | INSEE communes via geo.api.gouv.fr (production: Filosofi 200 m grid) | inhabitants within 30 min |
| Boundary | OpenStreetMap via Nominatim | department outline |
| Routing | Valhalla FOSSGIS (free, default) or OpenRouteService | matrix and isochrones |
| Geocoding | geo.api.gouv.fr / API Adresse (free) or ORS | commune search |

## Precompute

```bash
npm run data:fetch     # boundary, communes, facilities (network required)
npm run precompute     # rings 0-10 / 10-20 / 20-30 / 30-45 / 45-60 / 60+ per care type
```

`precompute.ts` requests 10, 20, 30, 45 and 60-minute isochrones for **each** facility, merges
the polygons per threshold, then builds disjoint rings by successive differences. The remainder
of the department forms the "more than 60 min" class.

The public Valhalla server limits isochrones to **1 location and 4 contours per request**, so the
script issues two calls per facility, caches responses in `.cache/` and waits `ORS_DELAY_MS`
(1.2 s) between calls. Set `USE_DEMO_ROUTING=1` for analytic demo rings (no network, less
accurate). `MAX_ETABLISSEMENTS` caps facilities per care type (default 250 in `.env.example`;
set to 60 for the shipped demo to keep precompute fast).

### Switching to production data

1. Leave `USE_DEMO_ROUTING=0` (default) for real, free Valhalla times.
2. Set `USE_FINESS=1` and provide `FINESS_CSV_URL` (geolocated FINESS extract).
3. Replace the grid generation in `scripts/precompute.ts` with a Filosofi 200 m extract
   (`p` = cell centre, `pop` = population).
4. Re-run `npm run precompute`.

### Self-hosted engine (free, no quota)

`scripts/ors-docker/docker-compose.yml` provides a local ORS instance. For Valhalla, the image
`valhalla/valhalla:latest` exposes the same `/isochrone` and `/sources_to_targets` endpoints on
port 8002. Point the proxy at your instance with `ORS_BASE_URL` (and `ORS_API_KEY` for local ORS).
Allow an OSM extract and at least 4 GB of RAM for the initial graph build.

## API key and security

- No key required. `ORS_API_KEY`, when present, is read **server-side only** (`process.env`) and
  never imported into `src/`.
- The browser only calls `/api/ors/*`: Vite middleware in development and preview, standalone
  Node server (`npm run build && npm run start:prod`) in production.
- In-memory cache TTL is 6 h; responses carry `X-ORS-Mode: live|estimate` and
  `X-Routing-Provider: valhalla|ors|estimate`.
- `.env` is gitignored; `.env.example` only contains a placeholder value.

## Using the app

- **Destination**: the three switches at the top recolour the map and change the markers.
- **Click / search a commune**: a matrix is computed to the 5 nearest facilities of each type;
  the shortest real driving time per type is shown.
- **Simulate**: isochrones from the selected point are merged with the existing coverage for the
  active type, rings are recomputed, and the territory share plus population within 30 min before
  and after are displayed (gain in % and inhabitants).
- **Opacity slider**: adjusts the overlay transparency.
- **Accessibility**: real buttons, labels and inputs, `aria-label`s, ≥ 44 px targets, high
  contrast, a bottom drawer on mobile and `prefers-reduced-motion` support.

## Credits and licensing

See [CREDITS.md](CREDITS.md) for libraries, datasets and AI-assisted work, and
[SUBMISSION.md](SUBMISSION.md) for the hackathon submission statement and judge demo path.
Data © OpenStreetMap contributors (ODbL), INSEE, DREES / FINESS (Licence Ouverte 2.0). Base map
© OpenStreetMap contributors via OpenFreeMap. Routing © Valhalla (FOSSGIS) and/or
OpenRouteService.
