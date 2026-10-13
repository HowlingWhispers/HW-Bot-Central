# Versioning and releases

Use Semantic Versioning: `MAJOR.MINOR.PATCH`.

- **MAJOR**: incompatible public API, storage migration, or significant behavior change after 1.0.
- **MINOR**: new backward-compatible feature (Character Studio or Access Manager).
- **PATCH**: bug fix, security correction or non-breaking maintenance.
- **FIX**: commit category, not an additional number (e.g. `fix: reject malformed IDs`).
- **RELEASE**: published version with changelog, verification and optionally a Git tag named `vX.Y.Z`.

Before v1.0.0, expect architecture to evolve; document incompatible changes prominently.

Checklist for every release: update package version, prepend changelog entry, run tests and build, confirm database compatibility, tag only after validation, deploy via Kilo and verify health. Keep deployment secrets and data outside the Git checkout.
