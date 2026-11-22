# Credits

## Software libraries

| Component | License |
| --- | --- |
| React / React DOM | MIT |
| Vite | MIT |
| TypeScript | Apache-2.0 |
| MapLibre GL JS | BSD-2-Clause |
| deck.gl (core, layers, mapbox) | MIT |
| Turf.js | MIT |
| OpenFreeMap — "liberty" vector style and map tiles | openly available map style/tiles; © OpenStreetMap contributors (ODbL) |
| Valhalla (FOSSGIS public demo) — routing engine | MIT |
| OpenRouteService — optional routing provider | openly available service (license terms at openrouteservice.org) |
| dotenv | MIT |
| ESLint | MIT |
| tsx | MIT |

## Datasets

- **© OpenStreetMap contributors (ODbL)** — hospitals, emergency rooms and general practitioners
  fetched via Overpass; department boundary via Nominatim; base map via OpenFreeMap.
- **DREES / FINESS — "Liste des maternités de France depuis 2000"** (2024 records), Licence
  Ouverte 2.0 — maternity facilities.
- **INSEE / geo.api.gouv.fr** — commune populations and centres, Licence Ouverte 2.0.
- **Filosofi (INSEE, 200 m grid)** — referenced for the production population grid.

## AI-assisted work

The application code, data pipeline and UI were generated with AI assistance (OpenCode) during
the event and reviewed by the author.

## Permissions and assets

All third-party material used is openly licensed or publicly available; permission to use it is
based on those licenses and on fair-use policies. No proprietary assets are included. No
AI-generated images or audio assets are bundled; the logo is an inline SVG created for this
project.

No secrets, passwords, API keys or private data are present in this repository. The `ORS_API_KEY`
is optional, read server-side only, and `.env` is gitignored.
