const {contextBridge,ipcRenderer}=require('electron');

// The renderer gets narrow actions and immutable data, never raw IPC or Node APIs.
const bootstrap=ipcRenderer.sendSync('asterloom:bootstrap');
if(bootstrap&&bootstrap.notebook)contextBridge.exposeInMainWorld('__ASTERLOOM_NOTEBOOK__',bootstrap.notebook);
contextBridge.exposeInMainWorld('asterloomDesktop',{
  platform:bootstrap?.platform||'unknown',
  availableExports:bootstrap?.availableExports||[],
  isExportedGame:!!bootstrap?.notebook,
  nativeGameAvailable:!!bootstrap?.nativeGameAvailable,
  nativeGameUnavailableReason:bootstrap?.nativeGameUnavailableReason||'',
  launchNativeGame:request=>ipcRenderer.invoke('asterloom:launch-native-game',request),
  clearNativeNotebook:id=>ipcRenderer.invoke('asterloom:clear-native-notebook',id),
  exportGame:(notebook,platform)=>ipcRenderer.invoke('asterloom:export-game',notebook,platform),
  exportNotebookArchive:packageText=>ipcRenderer.invoke('asterloom:export-notebook-archive',packageText),
  importNotebookArchive:()=>ipcRenderer.invoke('asterloom:import-notebook-archive'),
  listNotebookExports:id=>ipcRenderer.invoke('asterloom:list-notebook-exports',id),
  trashNotebookExports:(id,ids)=>ipcRenderer.invoke('asterloom:trash-notebook-exports',id,ids),
  clearNotebookCache:()=>ipcRenderer.invoke('asterloom:clear-notebook-cache'),
  saveSourceMaterial:request=>ipcRenderer.invoke('asterloom:save-source-material',request),
  setTorEnabled:enabled=>ipcRenderer.invoke('asterloom:set-tor',enabled),
  getTorStatus:()=>ipcRenderer.invoke('asterloom:tor-status'),
});
