# The Human

A 3D life simulation set in everyday Indonesian life, playable in the web browser (phones first).

- Play: https://andilie0112-debug.github.io/the-human/
- Design: [Design/GDD.md](Design/GDD.md), milestones: [Design/ROADMAP.md](Design/ROADMAP.md)
- Instructions for Claude Code: [CLAUDE.md](CLAUDE.md)

## Development

```bash
npm install
npm run dev        # local dev server
npm test           # Vitest unit tests
npm run build      # type-check + production build
npm run test:e2e   # Playwright smoke test (after build)
```

Every push to `main` runs the tests and deploys to GitHub Pages (`.github/workflows/deploy.yml`).
