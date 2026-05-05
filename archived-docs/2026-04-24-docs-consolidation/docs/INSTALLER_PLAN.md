# Installer Plan

## Current State (Phase 1)
We have simple scaffolding scripts (`install-macos.sh` and `install-windows.ps1`). They verify Node.js, run `npm install`, and call the `db-init.mjs` to bootstrap the local folders and database.

## Future State (Phase 2+)
The installer needs to become robust enough for non-technical users:
1. **Node.js Installation**: If Node.js is missing, the installer should download the standalone binary or use standard package managers (Homebrew on macOS, winget on Windows).
2. **Playwright Setup**: It must run `npx playwright install chromium` to ensure browser automation works.
3. **Daemon/Service**: Set up a background process to run the app silently, potentially adding an OS-level menu bar icon to access the dashboard.
4. **Desktop Shortcuts**: Create an icon on the desktop that launches `http://localhost:3000`.
