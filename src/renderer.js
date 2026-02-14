const state = {
  servers: [],
  accounts: [],
  preferences: {
    selectedServerId: null,
    selectedAccountId: null
  }
};

const formServer = document.getElementById('server-form');
const formAccount = document.getElementById('account-form');
const statusLog = document.getElementById('status-log');

const fields = {
  serverId: document.getElementById('server-id'),
  serverLabel: document.getElementById('server-label'),
  serverHost: document.getElementById('server-host'),
  serverPort: document.getElementById('server-port'),
  serverVersion: document.getElementById('server-version'),
  accountId: document.getElementById('account-id'),
  accountLabel: document.getElementById('account-label'),
  accountUsername: document.getElementById('account-username'),
  accountAuth: document.getElementById('account-auth'),
  serverSelect: document.getElementById('server-select'),
  accountSelect: document.getElementById('account-select'),
  connectBtn: document.getElementById('connect-btn'),
  disconnectBtn: document.getElementById('disconnect-btn'),
  updateInfo: document.getElementById('update-info'),
  checkUpdateBtn: document.getElementById('check-update-btn')
};

function addStatus(message, type = 'info') {
  const item = document.createElement('li');
  const prefix = {
    info: 'ℹ️',
    success: '✅',
    error: '❌',
    warn: '⚠️'
  }[type] || 'ℹ️';

  item.textContent = `${prefix} ${new Date().toLocaleTimeString()} — ${message}`;
  statusLog.prepend(item);
}

function toOption(label, value) {
  const option = document.createElement('option');
  option.value = value;
  option.textContent = label;
  return option;
}

function renderSelects() {
  fields.serverSelect.replaceChildren();
  fields.accountSelect.replaceChildren();

  state.servers.forEach((server) => {
    const version = server.version || 'auto';
    fields.serverSelect.append(toOption(`${server.label} (${server.host}:${server.port}, ${version})`, server.id));
  });

  state.accounts.forEach((account) => {
    fields.accountSelect.append(toOption(`${account.label} (${account.auth})`, account.id));
  });

  if (state.preferences.selectedServerId) {
    fields.serverSelect.value = state.preferences.selectedServerId;
  }

  if (state.preferences.selectedAccountId) {
    fields.accountSelect.value = state.preferences.selectedAccountId;
  }
}

async function refreshUpdateInfo() {
  try {
    const mineflayerInfo = await window.api.getUpdateInfo();
    fields.updateInfo.textContent =
      `App auto-sync is ON. Mineflayer ${mineflayerInfo.currentVersion} (latest ${mineflayerInfo.latestVersion}). ` +
      `Supported MC: ${mineflayerInfo.supportedVersions.join(', ')}`;
  } catch (error) {
    fields.updateInfo.textContent = `Could not load update info: ${error.message}`;
  }
}

async function init() {
  const config = await window.api.getConfig();
  state.servers = config.servers;
  state.accounts = config.accounts;
  state.preferences = config.preferences;
  renderSelects();
  await refreshUpdateInfo();
  addStatus('Launcher ready. Add/save profiles if needed, then connect.', 'success');
}

formServer.addEventListener('submit', async (event) => {
  event.preventDefault();

  const server = {
    id: fields.serverId.value || undefined,
    label: fields.serverLabel.value.trim(),
    host: fields.serverHost.value.trim(),
    port: Number(fields.serverPort.value),
    version: fields.serverVersion.value.trim() || 'auto'
  };

  state.servers = await window.api.saveServer(server);
  renderSelects();
  fields.serverId.value = '';
  formServer.reset();
  fields.serverPort.value = '25565';
  fields.serverVersion.value = 'auto';
  addStatus(`Saved server profile: ${server.label}`, 'success');
});

formAccount.addEventListener('submit', async (event) => {
  event.preventDefault();

  const account = {
    id: fields.accountId.value || undefined,
    label: fields.accountLabel.value.trim(),
    username: fields.accountUsername.value.trim(),
    auth: fields.accountAuth.value
  };

  state.accounts = await window.api.saveAccount(account);
  renderSelects();
  fields.accountId.value = '';
  formAccount.reset();
  fields.accountAuth.value = 'microsoft';
  addStatus(`Saved account profile: ${account.label}`, 'success');
});

fields.connectBtn.addEventListener('click', async () => {
  const serverId = fields.serverSelect.value;
  const accountId = fields.accountSelect.value;

  if (!serverId || !accountId) {
    addStatus('You must choose both a server and account profile.', 'warn');
    return;
  }

  try {
    await window.api.connectBot({ serverId, accountId });
    state.preferences.selectedServerId = serverId;
    state.preferences.selectedAccountId = accountId;
    await window.api.setPreferences(state.preferences);
  } catch (error) {
    addStatus(`Unable to connect: ${error.message}`, 'error');
  }
});

fields.disconnectBtn.addEventListener('click', async () => {
  await window.api.disconnectBot();
});

fields.checkUpdateBtn.addEventListener('click', async () => {
  try {
    await window.api.checkLauncherUpdates();
    await refreshUpdateInfo();
  } catch (error) {
    addStatus(`Launcher update check failed: ${error.message}`, 'error');
  }
});

fields.serverSelect.addEventListener('change', async () => {
  state.preferences.selectedServerId = fields.serverSelect.value;
  await window.api.setPreferences(state.preferences);
});

fields.accountSelect.addEventListener('change', async () => {
  state.preferences.selectedAccountId = fields.accountSelect.value;
  await window.api.setPreferences(state.preferences);
});

window.api.onBotStatus(({ message, type }) => addStatus(message, type));

init().catch((error) => {
  addStatus(`Startup error: ${error.message}`, 'error');
});
