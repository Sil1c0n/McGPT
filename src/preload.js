const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('api', {
  getConfig: () => ipcRenderer.invoke('config:get'),
  saveServer: (server) => ipcRenderer.invoke('servers:save', server),
  saveAccount: (account) => ipcRenderer.invoke('accounts:save', account),
  setPreferences: (preferences) => ipcRenderer.invoke('preferences:set', preferences),
  connectBot: (payload) => ipcRenderer.invoke('bot:connect', payload),
  disconnectBot: () => ipcRenderer.invoke('bot:disconnect'),
  onBotStatus: (handler) => {
    const listener = (_, payload) => handler(payload);
    ipcRenderer.on('bot:status', listener);
    return () => ipcRenderer.removeListener('bot:status', listener);
  }
});
