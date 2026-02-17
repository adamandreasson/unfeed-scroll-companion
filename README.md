# unfeed_social

Unfeed desktop client – syncs your social media feeds to [unfeed.ai](https://unfeed.ai) for your daily newspaper. Open-source Electron app; runs in the system tray.

## Prerequisites

- Node.js 18+
- npm

## Setup

```bash
npm install
```

Create a `.env` file in the project root (do not commit it) if you need to point at a custom backend:

```
UNFEED_API_BASE=https://unfeed.ai
```

If omitted, the app uses `https://unfeed.ai` by default.

## Development

```bash
npm run start
```

Starts the app in development mode. Login window and tray icon appear.

## Build

- **Package** (creates app in `out/`):  
  `npm run package`

- **Make installers** (DMG, Squirrel, deb):  
  `npm run make`

## License

MIT – see [LICENSE.md](LICENSE.md).
