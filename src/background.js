chrome.runtime.onInstalled.addListener(function () {
  console.log("Facebook Groups Exporter installed.");
});

// MV3 service workers have no URL.createObjectURL, so downloads use data: URLs.
// Part files are ~30KB each — well within data-URL limits.
function utf8ToBase64(str) {
  var bytes = new TextEncoder().encode(str);
  var binary = "";
  var CHUNK = 0x8000;
  for (var i = 0; i < bytes.length; i += CHUNK) {
    binary += String.fromCharCode.apply(null, bytes.subarray(i, i + CHUNK));
  }
  return btoa(binary);
}

chrome.runtime.onMessage.addListener(function (request, sender, sendResponse) {
  // Downloads are routed through chrome.downloads here so mid-scan part files
  // can't be silently swallowed by the page-level multiple-downloads prompt.
  if (request.action === "downloadFile") {
    try {
      var dataUrl = "data:application/json;base64," + utf8ToBase64(request.content);
      chrome.downloads.download({ url: dataUrl, filename: request.filename }, function (downloadId) {
        if (chrome.runtime.lastError) {
          sendResponse({ success: false, error: chrome.runtime.lastError.message });
        } else {
          sendResponse({ success: true, id: downloadId });
        }
      });
    } catch (e) {
      sendResponse({ success: false, error: e.message });
    }
    return true;
  }

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
