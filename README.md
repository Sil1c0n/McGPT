# McGPT Launcher (Mineflayer + GUI)

Desktop launcher for a Mineflayer bot with:
- saved **server profiles**
- saved **account profiles**
- connect/disconnect controls
- status log for login/connect events
- in-app **Mineflayer update** check + one-click update
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
- Use **Mineflayer Updates** panel to check latest version and update without reinstalling the app.
- This is a clean starter so you can later add:
  - command system
  - Ollama integration
  - bot AI behaviors

## Project structure

- `src/main.js` – Electron main process + Mineflayer lifecycle.
- `src/preload.js` – secure IPC bridge for renderer.
- `src/index.html` / `src/styles.css` / `src/renderer.js` – GUI.
