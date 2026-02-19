# Scroll Companion

Open-source Electron desktop client for [unfeed.ai](https://unfeed.ai). Runs in the system tray and periodically scrolls your social media feeds, uploading posts to Unfeed so they appear in your personalized daily newspaper.

## How it works

1. **Authenticate** with your Unfeed account (email + PIN).
2. **Connect** your social media accounts (currently X/Twitter).
3. The app sits in your **system tray** and periodically scrolls your feed in a hidden browser window, collecting posts.
4. Posts are uploaded to the Unfeed API, where they're used to build your daily summary.

## Architecture

```
src/
├── main/               # Electron main process
│   ├── index.js        # App entry point, window management
│   ├── api-client.js   # HTTP client for unfeed.ai API
│   ├── ipc-handlers.js # IPC bridge (renderer ↔ main)
│   ├── scheduler.js    # Periodic scroll scheduler
│   ├── scroller.js     # Platform-agnostic scroll abstraction
│   ├── store.js        # Persistent config (electron-store + safeStorage)
│   ├── tray.js         # System tray icon and menu
│   ├── updater.js      # Auto-update (electron-updater)
│   ├── log.js          # Dev-only logger
│   └── platforms/      # Platform implementations
│       ├── base.js     # Abstract base class
│       ├── index.js    # Platform registry
│       └── x.js        # X (Twitter) implementation
├── preload/
│   └── preload.cjs     # Secure bridge (contextBridge)
└── renderer/
    ├── login.html/js   # Login window (email + PIN)
    ├── popup.html/js   # Tray popup (status, controls)
    └── icons/          # Tray icons
```

## Prerequisites

- Node.js 18+
- npm

## Setup

```bash
npm install
```

Optionally create a `.env` file in the project root to override the API endpoint (defaults to `https://unfeed.ai`):

```
UNFEED_API_BASE=https://unfeed.ai
```

## Development

```bash
npm start
```

Starts the app via Electron Forge. A login window and tray icon will appear.

## Build

Package the app for distribution:

```bash
npm run package     # Creates app bundle in out/
npm run make        # Creates platform installers (DMG, Squirrel, deb)
```

## Adding a new platform

1. Create a new class extending `PlatformBase` in `src/main/platforms/`.
2. Implement all abstract methods (`scrollFeed`, `openLoginWindow`, `getAccountInfo`, etc.).
3. Register it in `src/main/platforms/index.js`.

## License

MIT — see [LICENSE.md](LICENSE.md).
