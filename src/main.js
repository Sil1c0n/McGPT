const path = require('node:path');
const { app, BrowserWindow, ipcMain } = require('electron');
const Store = require('electron-store');
const mineflayer = require('mineflayer');

const store = new Store({
  defaults: {
    servers: [],
    accounts: [],
    preferences: {
      selectedServerId: null,
      selectedAccountId: null
    }
  }
});

let mainWindow;
let bot;

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

ipcMain.handle('config:get', async () => getAllConfig());

ipcMain.handle('servers:save', async (_, server) => {
  const servers = store.get('servers');
  const serverWithId = {
    ...server,
    id: server.id || toId(),
    port: Number(server.port || 25565),
    version: server.version || false
  };

  const existingIndex = servers.findIndex((s) => s.id === serverWithId.id);
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

  const existingIndex = accounts.findIndex((a) => a.id === accountWithId.id);
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
    version: server.version === 'auto' ? false : (server.version || false),
    username: account.username,
    auth: account.auth
  };

  emitStatus(`Connecting to ${options.host}:${options.port} as ${options.username} (${options.auth})...`);

  bot = mineflayer.createBot(options);
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

app.whenReady().then(() => {
  createWindow();

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
