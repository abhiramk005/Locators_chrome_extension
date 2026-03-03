// background.js

// 1. Initialize Side Panel behavior safely
chrome.runtime.onInstalled.addListener(() => {
  chrome.sidePanel
    .setPanelBehavior({ openPanelOnActionClick: true })
    .catch((error) => console.error("SidePanel Error:", error));
});

// 2. State management to track if the inspector is ON
let isInspectingGlobal = false;

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  // Relay locator to the Side Panel
  if (message.type === 'LOCATOR_CAPTURED') {
    chrome.runtime.sendMessage({ 
        type: 'DISPLAY_LOCATOR', 
        locator: message.locator 
    }).catch(() => {
      console.log("Side panel might be closed; locator not displayed.");
    });
  }
  
  // Update the global state when the user toggles the button in the panel
  if (message.type === 'STATE_SYNC') {
    isInspectingGlobal = message.value;
  }
});

// 3. Re-inject state on page refresh
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (changeInfo.status === 'complete' && isInspectingGlobal) {
    chrome.tabs.sendMessage(tabId, { type: 'TOGGLE_INSPECT', value: true }).catch(() => {
      // Content script might not be injected yet; this is expected on some pages
    });
  }
});