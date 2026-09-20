# Validation and remaining device checks

## Automated checks

`npm run check` parses the application modules. `npm test` exercises:

- Seed determinism and the unassembled default condition.
- All three starting modes, numerical stability, and the packet-count ledger.
- Actual closed-boundary detection and rupture.
- Resource-dependent complementary copying and completed-generation accounting.
- Membrane separation of copying participants.
- Geometric splitting into distinct bond cycles without creating material.
- Translation of whole compartments during resizing.
- Exact JSON checkpoint continuation, including partial templates and unused IDs.
- Rejection of malformed imports without changing a running world.
- Extreme environmental settings, oval borders, and capacity limits.
- Builder injection geometry and accounting.
- The actual worker message protocol for pause, single step, checkpoint, restore, and error recovery.
- Production asset completeness, standalone manifest, generated PNG sizes, offline cache paths, subdirectory hosting, and module references.

The build has no package-download step. CI repeats these checks before producing or deploying the static site.

## Current verification boundary

The implementation has been checked through Node-based engine, worker, and build tests. Longer development runs exercised all three starting modes without non-finite positions or packet-accounting errors. These are software invariants, not biological validation.

**Interactive browser screenshots and physical iPhone testing have not been completed.** The authoring environment blocked local browser navigation. Responsive layouts, safe-area insets, touch gestures, dialogs, Home Screen metadata, and offline files are implemented, but real-device usability, rendering, power consumption, and achievable acceleration still need verification. No 64× performance promise is made.

## Manual acceptance checklist after hosting

Target modern Safari on iPhone (iOS 17 or later), portrait and landscape, plus a current desktop browser.

- Open the deployed URL: particles move, the clock advances, no console errors occur.
- Check 375-pixel and 430-pixel portrait widths; controls remain reachable without horizontal page scrolling.
- Pause, step, and change speed. Open a dialog and close it: the previous running/paused state returns.
- Pan with one finger and pinch with two; fit the environment. At close zoom, inspect an internal molecule.
- Change all habitat sliders and chamber shape/dimensions. Start each mode.
- Create, edit, save, load, and release a design. Confirm a full world reports capacity rather than losing material.
- Save a world, change it, and restore it. Export to Files and import the same JSON. Try an invalid file.
- Add to Home Screen. Wait for offline readiness, close the app, enable airplane mode, and reopen.
- Background the app and return: it resumes without a large catch-up jump.
- Deploy a changed build. Close all instances, reopen online, and confirm the new service worker activates; then verify offline behavior again.
- Run a balanced-budget world for 10 minutes and observe responsiveness, heat, and actual acceleration.

If you report an issue, include the exported world, device/browser version, action sequence, and expected behavior. A checkpoint is more useful than a seed after user interventions.
