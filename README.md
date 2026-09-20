# Life Simulator

A small water world. A molecular beginning. An open-ended experiment.

**Life Simulator** is a touch-first, offline-capable evolutionary sandbox for iPhone and desktop browsers. Its membranes and molecular chains are drawn from the same particles and bonds that the simulation computes. There are no ready-made organism sprites or flagellum parts.

**Scientific scope:** this is a coarse artificial chemistry inspired by biology, not a literal reconstruction of abiogenesis. It supports assembly, resource-dependent RNA-like copying with mutation, membrane growth and geometric splitting, nested compartments, and adhesive aggregates. Complete eukaryogenesis, specialized multicellular development, meiosis, and sexual reproduction are not implemented. See [the model specification](docs/SCIENTIFIC_MODEL.md).

## Open and install on iPhone

The project includes a GitHub Pages deployment workflow. The intended address, **once Pages is enabled and the deployment succeeds**, is:

**https://owningturtle287.github.io/Life-Simulator/**

One-time repository setup:

1. Open [Settings → Pages](https://github.com/Owningturtle287/Life-Simulator/settings/pages).
2. Under **Build and deployment → Source**, select **GitHub Actions**.
3. Open [Actions → Publish iPhone web app](https://github.com/Owningturtle287/Life-Simulator/actions/workflows/pages.yml), then **Run workflow** on `main`. If a previous run failed because Pages was disabled, rerun it.
4. Wait for the deployment to finish. Open its website URL in Safari on your iPhone.
5. In Safari, open **Share → Add to Home Screen**, choose **Open as Web App** if offered, then **Add**. The app includes these instructions under the save/download icon.

This installs a web app, not a signed native `.ipa`. An App Store account or Xcode is not needed for the web app. The first visit needs a connection; wait for “Ready for offline exploration” before trying offline. Reopen while online to receive updates. Export important worlds as JSON because device storage can be cleared.

Source instructions: [GitHub Pages publishing](https://docs.github.com/en/pages/getting-started-with-github-pages/configuring-a-publishing-source-for-your-github-pages-site) and [Apple Home Screen installation](https://support.apple.com/guide/iphone/bookmark-a-website-iph42ab2f3a7/ios).

## Explore

- **Primordial water — default:** free molecular packets, mineral surfaces, nutrient sources, light, diffusion, and currents. Nothing is preassembled. Choose a seed, speed up time, and watch encounters form chains and enclosures. A run can stall or fail.
- **Prokaryotic start:** seed simple compartments with exposed information chains and metabolism alongside free matter.
- **Eukaryotic start:** seed nested compartments and small enclosed compartments. These are structural analogues, not complete biological eukaryotes.
- **Habitat:** change temperature, nutrient influx, illumination, mixing, pH, salinity, mutation probability, chamber dimensions, rectangular/oval borders, and particle budget. Choose mineral density for a new world, or paint additional minerals into the water.
- **Microscope:** pan, pinch/scroll to zoom, fit the chamber, select a structure, or follow it. At close zoom, tap individual components inside a cell. View natural color, bonds, energy, or lineages.
- **Observe:** inspect actual material counts, closed compartments, model cells, current lineages, generation counts, measured population history, and event notes.
- **Cell studio:** place, move, connect, and erase molecular components. A live checklist checks enclosure, an internal information chain, catalysis, and energy supply. The editable guided enclosure gives a starting example. Save/load designs, undo, and release your exact arrangement into the water.
- **World files:** save/restore an exact device checkpoint or export/import a portable JSON world, including the random state and partially copied templates.

The 1×/4×/16×/64× controls request more fixed physics steps, never a larger time step. Achievable speed depends on your device and particle count. For a phone, start with the light or balanced budget. Simulation pauses while the app is hidden; there is no background geological catch-up.

## Run locally

Install Node.js 22 or newer. This project has **no third-party runtime or npm dependencies**.

```sh
npm start
```

Open `http://localhost:4173`. Do not double-click `index.html`: module workers require a web server. Offline installation requires HTTPS, or localhost for development.

```sh
npm run check
npm test
npm run build
node scripts/serve.mjs --dist
```

`dist/` is the complete deployable static site. Serve it at the root or under a subdirectory. The app uses relative paths, so the `Life-Simulator/` repository prefix works. No API keys, accounts, analytics, remote fonts, or application server are needed.

GitHub **Verify simulator** checks syntax, runs the tests, builds the site, and supplies a downloadable `life-simulator-web-app` artifact. **Publish iPhone web app** performs the same gates and deploys `dist/` to Pages. The repository contains all source files, including the icon generator; PNG icons and `dist/` are reproducible build outputs.

## How it is organized

| File | Responsibility |
| --- | --- |
| `src/engine.js` | Seeded fixed-step particle world, bonds, chemistry, templates, compartments, accounting, checkpoint validation |
| `src/chemistry.js` | Molecular definitions, configuration bounds, geometry helpers, random generator |
| `src/worker.js` | Simulation worker, controls, time budget, snapshots |
| `src/renderer.js` | Canvas microscope, geometry rendering, picking, camera, history plot |
| `src/builder.js` | Guided molecular editor and blueprint analysis |
| `src/main.js` | Interface, gestures, settings, save files, installation |
| `index.html`, `style.css` | Responsive instrument-style interface and accessible controls |
| `sw.js`, `manifest.webmanifest` | Offline app shell and Home Screen installation |
| `scripts/` | Dependency-free development server, build, and icon generation |
| `tests/` | Scientific-model invariants, saved-state regression tests, worker protocol, deployment completeness |

Read [SCIENTIFIC_MODEL.md](docs/SCIENTIFIC_MODEL.md) for exact assumptions, [EXPERIMENTS.md](docs/EXPERIMENTS.md) for guided experiments, and [VALIDATION.md](docs/VALIDATION.md) for checked behavior and remaining device checks.
