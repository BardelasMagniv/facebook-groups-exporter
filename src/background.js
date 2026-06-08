chrome.runtime.onInstalled.addListener(function () {
  console.log("Facebook Groups Exporter installed.");
});

chrome.runtime.onMessage.addListener(function (request, sender, sendResponse) {
  if (request.action === "exportGroups") {
    const splitMode = request.splitMode === true;

    chrome.tabs.query({ active: true, currentWindow: true }, function (tabs) {
      if (!tabs[0]) {
        sendResponse({ success: false, error: "No active tab found" });
        return;
      }

      const tabId = tabs[0].id;

      // Try sending message to the existing content script first
      chrome.tabs.sendMessage(tabId, { action: "exportGroups", splitMode: splitMode }, function (response) {
        if (chrome.runtime.lastError) {
          console.log("[FB Groups Exporter] Content script not found, injecting dynamically...", chrome.runtime.lastError.message);

          // Fallback: inject the content script programmatically
          chrome.scripting.executeScript({
            target: { tabId: tabId },
            files: ["src/content.js"]
          }, function (injectionResults) {
            if (chrome.runtime.lastError) {
              sendResponse({ success: false, error: "Could not inject content script: " + chrome.runtime.lastError.message });
              return;
            }

            // Retry message after injection (small delay for script initialization)
            setTimeout(function () {
              chrome.tabs.sendMessage(tabId, { action: "exportGroups", splitMode: splitMode }, function (retryResponse) {
                if (chrome.runtime.lastError) {
                  sendResponse({ success: false, error: "Content script failed after injection: " + chrome.runtime.lastError.message });
                } else {
                  sendResponse(retryResponse || { success: true });
                }
              });
            }, 500);
          });
        } else {
          sendResponse(response || { success: true });
        }
      });
    });
    return true;
  }
});
