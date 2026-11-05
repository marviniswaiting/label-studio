# Label Studio

A mobile-friendly progressive web app for generating Code 128, Code 39, EAN-13, QR Code, and Data Matrix labels.

## QR safety improvements

- QR modules are rendered at integer pixel sizes based on the actual matrix version.
- Every QR includes the required four-module white quiet zone.
- **Code Spacing** adjusts separation in both the preview grid and PDF exports.
- Spacing is stored in presets.
- PDF exports preserve square QR/Data Matrix geometry and include QR quiet zones.

## Reliability and security

- Template expansion is limited to 1,000 codes and rejects zero-step ranges.
- Generated labels are inserted as text, preventing template/imported-content HTML injection.
- EAN-13 values are validated and canonicalised instead of silently rewritten.
- Runtime libraries are pinned and stored locally for offline use.
- The PWA works without third-party network requests after installation.

## Development

```bash
npm install
npx playwright install chromium
npm test
```

The test suite covers mobile and desktop Chromium, QR geometry and quiet zones, PDF layout, offline operation, input validation, presets, and injection resistance.
