# 02 Out-of-spec capabilities: web-app (run 2026-10-13-1)

Reverse trace from code and routes to the reconstructed spec. Classes: ADDITIVE-VALUABLE / NEUTRAL / INCOMPLETE / RISKY / CONFLICTING / UNINTENDED.

| Capability | Class | Note |
|---|---|---|
| Map drawing (Terra Draw), snapping, sketch persistence, export (GeoJSON/CSV), PDF/print sheets | ADDITIVE-VALUABLE | Tested (vitest sketches, snap, print-sheet). Print and legend output verified visually in earlier sessions only |
| Colour-by layers and built-in colour schemes | ADDITIVE-VALUABLE | color-schemes.test.ts |
| Geolocation: "Use my location", nearest site within 500 m | ADDITIVE-VALUABLE | geolocate.test.ts; needs HTTPS or localhost in the browser |
| HEIC/TIFF/BMP upload conversion to JPEG | ADDITIVE-VALUABLE | Dyn-tested. Adds `pillow-heif` dependency |
| Profile preferences (density, phone, table), command search, keyboard shortcuts | ADDITIVE-VALUABLE | shortcuts.test.tsx, table-display-settings.test.tsx |
| Saved views, column menu, bulk edit, CSV import/export of tables | ADDITIVE-VALUABLE | Tests exist |
| `DELETE /api/admin/orphans` (rows-outward cleanup) | NEUTRAL | Works from rows, so unaffected by SPEC-26 |
| `POST /api/admin/reseed` | NEUTRAL | Gated by SEED_ENABLED; forced off in production |
| Share button, record peek, return-path navigation | NEUTRAL | |
| `generate:types` script targets port 8001 | UNINTENDED | Points at the user's other app; harmless but would generate the wrong schema if both run |
| User emails in info/warning logs | RISKY (low) | PII in logs; no secrets |
| Frontend container master process is root | RISKY (low) | Standard nginx image; `nginx-unprivileged` would remove it |
| `notify()` with no producer | INCOMPLETE | See SPEC-18 |

No CONFLICTING items found. Debug-only routes: none found.
