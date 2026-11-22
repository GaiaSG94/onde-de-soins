# Submission

## Work completed during the event

The application code, scripts, generated GeoJSON and UI were written and generated from scratch
during the event in this repository. No pre-existing application code or template was copied.

Pre-existing items are limited to:

- external open datasets, licensed as described in [CREDITS.md](CREDITS.md);
- third-party open-source libraries, credited in [CREDITS.md](CREDITS.md).

No AI-generated images or audio assets are bundled. The logo is an inline SVG created for this
project.

This project is submitted before the published submission deadline.

## Judge demo path

```bash
npm install && npm run dev
```

Open **http://localhost:5173**. No API key is needed. Alternatively:

```bash
npm run build && npm run start:prod
```

What to click and expect:

1. **Destination switch** (top of the screen: Maternity / Emergency / General practitioner) — the
   map recolours and the facility markers change.
2. **Map click or commune search** — three real driving times appear (one per care type),
   computed to the 5 nearest facilities of each type, shortest time shown.
3. **Simulate button** — a new service is added at the selected point; the map is recoloured and
   the panel shows the territory share and population within 30 min before/after, with the gain
   in % and inhabitants.
4. **Opacity slider** — adjusts overlay transparency without hiding roads and labels.

The shipped demo department is **Nièvre (58)**. To use another department, set the
`DEPARTEMENT_CODE` and `DEPARTEMENT_NAME` environment variables, then re-run `npm run data:fetch`
and `npm run precompute`.

## Requirements

- Node.js >= 20
- Network access for map tiles and live routing/geocoding
- Optional `ORS_API_KEY` only to use the OpenRouteService provider (Valhalla is the free default)
- Optional Docker / self-hosted routing engine for scale (see README.md)

The files in `public/data/*.geojson` are committed generated artifacts so the base map and
coverage layers work offline for the demo; live clicks and the simulation require network access.
