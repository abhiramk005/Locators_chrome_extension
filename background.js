// background.js
let isInspectingGlobal = false; // Initialized at top level

chrome.runtime.onInstalled.addListener(() => {
  chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true });
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  // Respond to the new page asking "Should I be inspecting?"
  if (message.type === 'GET_INSPECT_STATE') {
    sendResponse({ isInspecting: isInspectingGlobal });
    return true; 
  }

  // Sync state from the Panel toggle
  if (message.type === 'STATE_SYNC') {
    isInspectingGlobal = message.value;
  }

  // Relay captured elements to the panel
  if (message.type === 'LOCATOR_CAPTURED') {
    chrome.runtime.sendMessage({ ...message, type: 'DISPLAY_LOCATOR' }).catch(() => {});
  }
  
  if (message.type === 'CRAWL_RESULTS') {
    chrome.runtime.sendMessage(message).catch(() => {});
  }
});

// Re-activate highlighters on new page loads if global state is ON
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (changeInfo.status === 'complete' && isInspectingGlobal) {
    chrome.tabs.sendMessage(tabId, { type: 'TOGGLE_INSPECT', value: true }).catch(() => {});
  }
});