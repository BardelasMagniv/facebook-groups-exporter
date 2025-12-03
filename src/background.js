chrome.runtime.onInstalled.addListener(function() {
  console.log("Facebook Groups Exporter installed.");
});

chrome.runtime.onMessage.addListener(function(request, sender, sendResponse) {
  if (request.action === "exportGroups") {
    chrome.tabs.query({ active: true, currentWindow: true }, function(tabs) {
      if (tabs[0]) {
        chrome.tabs.sendMessage(tabs[0].id, { action: "exportGroups" }, function(response) {
          if (chrome.runtime.lastError) {
            sendResponse({ success: false, error: chrome.runtime.lastError.message });
          } else {
            sendResponse(response || { success: true });
          }
        });
      } else {
        sendResponse({ success: false, error: "No active tab found" });
      }
    });
    return true;
  }
});
