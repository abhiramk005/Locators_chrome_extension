// background.js

chrome.runtime.onInstalled.addListener(() => {
  chrome.sidePanel
    .setPanelBehavior({ openPanelOnActionClick: true })
    .catch((error) => console.error("SidePanel Error:", error));
});

let isInspectingGlobal = false;

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'LOCATOR_CAPTURED') {
    // Forward to side panel with a NEW type to avoid double-listening
    chrome.runtime.sendMessage({
      ...message,
      type: 'DISPLAY_LOCATOR' 
    }).catch(() => {
      /* Side panel might be closed */
    });
  }
  
  if (message.type === 'STATE_SYNC') {
    isInspectingGlobal = message.value;
  }
});

chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (changeInfo.status === 'complete' && isInspectingGlobal) {
    chrome.tabs.sendMessage(tabId, { type: 'TOGGLE_INSPECT', value: true }).catch(() => {});
  }
});