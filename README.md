# McGPT Launcher (Mineflayer + GUI)

Desktop launcher for a Mineflayer bot with:
- saved **server profiles**
- saved **account profiles**
- connect/disconnect controls
- status log for login/connect events
- **automatic launcher updates** from GitHub (source + packaged modes)
- in-app Mineflayer version visibility
- Microsoft device-code auth flow (opens browser automatically)

## 1) Install

```bash
npm install
```

## 2) Run desktop app

```bash
npm start
```

## 3) Build a Windows `.exe`

```bash
npm run pack
```

Installer output will be in `dist/`.

## Usage flow

1. Add a server profile (host/port/version).
2. Add an account profile.
   - `microsoft` auth: use your Microsoft Minecraft email.
   - `offline` auth: use any offline username.
3. Pick server + account in **Connect** section.
4. Click **Connect**.

## Notes

- Setting version to `auto` lets Mineflayer negotiate version automatically.
- If Mineflayer reports a Microsoft device code, the launcher will open the verification page and print the code in Status.
- App updates now happen automatically:
  - **If running from source (`npm start`)**: launcher auto-runs `git pull --ff-only` on startup and every ~10 minutes.
  - **If running packaged `.exe`**: launcher checks GitHub releases via Electron auto-updater and downloads updates automatically.
- Use **Launcher Auto-Updates** panel to trigger an immediate update check.
- This is a clean starter so you can later add:
  - command system
  - Ollama integration
  - bot AI behaviors

## Project structure

- `src/main.js` – Electron main process + Mineflayer lifecycle.
- `src/preload.js` – secure IPC bridge for renderer.
- `src/index.html` / `src/styles.css` / `src/renderer.js` – GUI.
