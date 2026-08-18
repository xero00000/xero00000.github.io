# Xero Web Lab

This repository is the source for `xero00000.github.io`.

The root page is a modular launcher. Each project lives in its own folder under `apps/`, so projects can coexist without overwriting one another.

## Project registry

Projects are listed in `apps.json`:

```json
{
  "id": "my-app",
  "title": "My App",
  "description": "Short description",
  "path": "apps/my-app/",
  "tags": ["Tools", "Graphics"],
  "status": "beta"
}
```

To add another project:

1. Create `apps/<project-id>/index.html` (and any project-local assets).
2. Add one entry to `apps.json`.
3. Push to `main`.

The homepage automatically builds search, tag filters, app counts, and launch cards from that registry.

## Current projects

- **Continual Image Trainer** — browser-side TensorFlow.js image search/training/generation experiment.
- **Retro PVM Simulator** — the original WebGL2 CRT/PVM simulation, preserved under `apps/retro-pvm/`.
