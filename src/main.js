const path = require('node:path');
const { execFile } = require('node:child_process');
const { promisify } = require('node:util');
const { app, BrowserWindow, ipcMain, shell } = require('electron');
const mineflayer = require('mineflayer');

const execFileAsync = promisify(execFile);
const AUTO_UPDATE_INTERVAL_MS = 10 * 60 * 1000;

let store;
let mainWindow;
let bot;
let autoUpdater;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 980,
    height: 720,
    title: 'McGPT Launcher',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  mainWindow.loadFile(path.join(__dirname, 'index.html'));
}

function toId() {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function getAllConfig() {
  if (!store) {
    throw new Error('Application store is not initialized yet.');
  }

  return {
    servers: store.get('servers'),
    accounts: store.get('accounts'),
    preferences: store.get('preferences')
  };
}

function emitStatus(message, type = 'info') {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('bot:status', { message, type, at: new Date().toISOString() });
  }
}

function getSupportedVersions() {
  if (Array.isArray(mineflayer.supportedVersions)) {
    return mineflayer.supportedVersions;
  }

  return [];
}

function normalizeVersion(version) {
  if (!version || version === 'auto') {
    return false;
  }

  const normalized = String(version).trim();
  const supportedVersions = getSupportedVersions();

  if (supportedVersions.includes(normalized)) {
    return normalized;
  }

  const withoutPatchZero = normalized.replace(/\.0+$/, '');
  if (supportedVersions.includes(withoutPatchZero)) {
    return withoutPatchZero;
  }

  const closest = supportedVersions.find((supportedVersion) => normalized.startsWith(supportedVersion));
  if (closest) {
    return closest;
  }

  const requestedParts = normalized.split('.').map((value) => Number.parseInt(value, 10));
  const hasMajorMinor = requestedParts.length >= 2 && requestedParts.slice(0, 2).every(Number.isFinite);
  if (hasMajorMinor) {
    const [requestedMajor, requestedMinor] = requestedParts;
    const sameMajorMinor = supportedVersions
      .map((supportedVersion) => ({
        version: supportedVersion,
        parts: supportedVersion.split('.').map((value) => Number.parseInt(value, 10))
      }))
      .filter(({ parts }) => parts.length >= 2 && parts[0] === requestedMajor && parts[1] === requestedMinor)
      .sort((a, b) => {
        const patchA = Number.isFinite(a.parts[2]) ? a.parts[2] : 0;
        const patchB = Number.isFinite(b.parts[2]) ? b.parts[2] : 0;
        return patchB - patchA;
      });

    if (sameMajorMinor.length) {
      return sameMajorMinor[0].version;
    }
  }

  return normalized;
}

function getNpmCommand() {
  return process.platform === 'win32' ? 'npm.cmd' : 'npm';
}

async function getLatestMineflayerVersion() {
  const npmCommand = getNpmCommand();
  const execOptions = {
    cwd: app.getAppPath(),
    timeout: 20000,
    ...(process.platform === 'win32' ? { shell: true } : {})
  };
  const { stdout } = await execFileAsync(npmCommand, ['view', 'mineflayer', 'version'], execOptions);

  return stdout.trim();
}

async function checkForSourceUpdates() {
  const appPath = app.getAppPath();

  await execFileAsync('git', ['rev-parse', '--is-inside-work-tree'], {
    cwd: appPath,
    timeout: 5000
  });

  const { stdout } = await execFileAsync('git', ['pull', '--ff-only'], {
    cwd: appPath,
    timeout: 30000
  });

  const output = stdout.trim();
  const updated = !output.toLowerCase().includes('already up to date');

  return {
    mode: 'source',
    updated,
    message: updated
      ? 'Downloaded latest GitHub changes. Restart app to apply new code.'
      : 'Already on latest GitHub commit.'
  };
}

async function checkForPackagedUpdates() {
  if (!autoUpdater) {
    return {
      mode: 'packaged',
      updated: false,
      message: 'Packaged updater is not configured.'
    };
  }

  try {
    const result = await autoUpdater.checkForUpdates();
    return {
      mode: 'packaged',
      updated: Boolean(result?.updateInfo?.version),
      message: 'Checked GitHub releases for app updates.'
    };
  } catch (error) {
    const message = String(error?.message || 'Unknown updater error');
    const missingReleaseMetadata = message.includes('latest.yml') && message.includes('404');

    if (missingReleaseMetadata) {
      return {
        mode: 'packaged',
        updated: false,
        message:
          'Launcher release metadata is missing (latest.yml not found). Publish a full electron-builder release before using packaged auto-updates.'
      };
    }

    throw error;
  }
}

async function checkForAppUpdates() {
  if (app.isPackaged) {
    return checkForPackagedUpdates();
  }

  return checkForSourceUpdates();
}

function wirePackagedAutoUpdaterEvents() {
  if (!autoUpdater) {
    return;
  }

  autoUpdater.autoDownload = true;
  autoUpdater.autoInstallOnAppQuit = true;

  autoUpdater.on('checking-for-update', () => emitStatus('Checking for launcher update...', 'info'));
  autoUpdater.on('update-available', (info) => {
    emitStatus(`Launcher update found (v${info.version}). Downloading automatically...`, 'warn');
  });
  autoUpdater.on('update-not-available', () => emitStatus('Launcher is up to date.', 'success'));
  autoUpdater.on('download-progress', (progress) => {
    emitStatus(`Launcher update download: ${Math.round(progress.percent)}%`, 'info');
  });
  autoUpdater.on('update-downloaded', () => {
    emitStatus('Launcher update downloaded. It will install after you close the app.', 'success');
  });
  autoUpdater.on('error', (error) => emitStatus(`Launcher update error: ${error.message}`, 'error'));
}

async function setupLauncherAutoUpdates() {
  if (app.isPackaged) {
    try {
      ({ autoUpdater } = require('electron-updater'));
      wirePackagedAutoUpdaterEvents();
      await checkForPackagedUpdates();
      setInterval(() => {
        checkForPackagedUpdates().catch((error) => emitStatus(`Updater check failed: ${error.message}`, 'error'));
      }, AUTO_UPDATE_INTERVAL_MS);
      return;
    } catch (error) {
      emitStatus(`Packaged updater unavailable: ${error.message}`, 'warn');
    }
  }

  emitStatus('Development mode: syncing latest code from GitHub automatically.', 'info');
  try {
    const result = await checkForSourceUpdates();
    emitStatus(result.message, result.updated ? 'warn' : 'success');
  } catch (error) {
    emitStatus(`GitHub sync failed: ${error.message}`, 'error');
  }

  setInterval(() => {
    checkForSourceUpdates()
      .then((result) => {
        if (result.updated) {
          emitStatus(result.message, 'warn');
        }
      })
      .catch((error) => emitStatus(`GitHub sync failed: ${error.message}`, 'error'));
  }, AUTO_UPDATE_INTERVAL_MS);
}

function disconnectBot() {
  if (!bot) {
    return;
  }

  try {
    bot.quit('Disconnected from launcher');
  } catch (error) {
    emitStatus(`Could not gracefully disconnect bot: ${error.message}`, 'error');
  } finally {
    bot = null;
  }
}

function attachBotEvents() {
  bot.on('login', () => emitStatus('Logged in successfully.', 'success'));
  bot.on('spawn', () => emitStatus('Bot spawned in-world.', 'success'));
  bot.on('kicked', (reason) => emitStatus(`Kicked from server: ${JSON.stringify(reason)}`, 'error'));
  bot.on('error', (error) => emitStatus(`Bot error: ${error.message}`, 'error'));
  bot.on('end', (reason) => {
    emitStatus(`Disconnected: ${reason || 'connection ended'}`, 'warn');
    bot = null;
  });
}

async function initializeStore() {
  if (store) {
    return;
  }

  const { default: Store } = await import('electron-store');
  store = new Store({
    defaults: {
      servers: [],
      accounts: [],
      preferences: {
        selectedServerId: null,
        selectedAccountId: null
      }
    }
  });
}

function registerIpcHandlers() {
  ipcMain.handle('config:get', async () => getAllConfig());

  ipcMain.handle('app:get-update-info', async () => {
    const declaredVersion = require('../package.json').dependencies.mineflayer || '';
    const currentVersion = String(declaredVersion).replace(/^[^0-9]*/, '');
    let latestVersion = currentVersion;

    try {
      latestVersion = await getLatestMineflayerVersion();
    } catch (error) {
      emitStatus(`Could not fetch latest mineflayer version: ${error.message}`, 'warn');
    }

    return {
      currentVersion,
      latestVersion,
      hasUpdate: currentVersion !== latestVersion,
      supportedVersions: getSupportedVersions()
    };
  });

  ipcMain.handle('app:check-launcher-updates', async () => {
    const result = await checkForAppUpdates();
    emitStatus(result.message, result.updated ? 'warn' : 'success');
    return result;
  });

  ipcMain.handle('servers:save', async (_, server) => {
    const servers = store.get('servers');
    const serverWithId = {
      ...server,
      id: server.id || toId(),
      port: Number(server.port || 25565),
      version: normalizeVersion(server.version)
    };

    const existingIndex = servers.findIndex((savedServer) => savedServer.id === serverWithId.id);
    if (existingIndex >= 0) {
      servers[existingIndex] = serverWithId;
    } else {
      servers.push(serverWithId);
    }

    store.set('servers', servers);
    return servers;
  });

  ipcMain.handle('accounts:save', async (_, account) => {
    const accounts = store.get('accounts');
    const accountWithId = {
      ...account,
      id: account.id || toId(),
      auth: account.auth || 'offline'
    };

    const existingIndex = accounts.findIndex((savedAccount) => savedAccount.id === accountWithId.id);
    if (existingIndex >= 0) {
      accounts[existingIndex] = accountWithId;
    } else {
      accounts.push(accountWithId);
    }

    store.set('accounts', accounts);
    return accounts;
  });

  ipcMain.handle('preferences:set', async (_, preferences) => {
    const merged = { ...store.get('preferences'), ...preferences };
    store.set('preferences', merged);
    return merged;
  });

  ipcMain.handle('bot:connect', async (_, { serverId, accountId }) => {
    disconnectBot();

    const servers = store.get('servers');
    const accounts = store.get('accounts');

    const server = servers.find((item) => item.id === serverId);
    const account = accounts.find((item) => item.id === accountId);

    if (!server) {
      throw new Error('Server profile was not found.');
    }

    if (!account) {
      throw new Error('Account profile was not found.');
    }

    const options = {
      host: server.host,
      port: Number(server.port || 25565),
      version: normalizeVersion(server.version),
      username: account.username,
      auth: account.auth,
      profilesFolder: path.join(app.getPath('userData'), 'profiles'),
      onMsaCode: (code) => {
        const verifyUri = code?.verificationUri || code?.verification_uri || 'https://microsoft.com/link';
        const userCode = code?.userCode || code?.user_code || code?.deviceCode || 'unknown';
        emitStatus(`Microsoft login required. Open ${verifyUri} and enter code ${userCode}.`, 'warn');

        if (userCode === 'unknown') {
          emitStatus(`Microsoft login payload missing code: ${JSON.stringify(code || {})}`, 'warn');
        }

        shell.openExternal(verifyUri).catch(() => {
          emitStatus('Could not automatically open browser for Microsoft login code.', 'warn');
        });
      }
    };

    emitStatus(`Connecting to ${options.host}:${options.port} as ${options.username} (${options.auth})...`);

    const supportedVersions = getSupportedVersions();
    if (options.version && supportedVersions.length && !supportedVersions.includes(options.version)) {
      emitStatus(
        `Version ${options.version} is not in this build's supported list (${supportedVersions.join(', ')}). Trying anyway.`,
        'warn'
      );
    }

    try {
      bot = mineflayer.createBot(options);
    } catch (error) {
      const unsupportedVersion = /not supported/i.test(error.message || '');

      if (options.version && unsupportedVersion) {
        emitStatus(
          `Version ${options.version} is unsupported by this Mineflayer build. Retrying with auto version detection...`,
          'warn'
        );
        bot = mineflayer.createBot({ ...options, version: false });
      } else {
        throw error;
      }
    }

    attachBotEvents();

    store.set('preferences', {
      selectedServerId: serverId,
      selectedAccountId: accountId
    });

    return { ok: true };
  });

  ipcMain.handle('bot:disconnect', async () => {
    disconnectBot();
    emitStatus('Disconnect requested from UI.', 'warn');
    return { ok: true };
  });
}

app.whenReady().then(async () => {
  await initializeStore();
  registerIpcHandlers();
  createWindow();
  await setupLauncherAutoUpdates();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  disconnectBot();
  if (process.platform !== 'darwin') {
    app.quit();
  }
});
