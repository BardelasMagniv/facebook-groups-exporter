document.addEventListener('DOMContentLoaded', function() {
    const exportButton = document.getElementById('export-button');
    const statusMessage = document.getElementById('status-message');
    const splitModeCheckbox = document.getElementById('split-mode-checkbox');
    const GROUPS_URL = 'https://www.facebook.com/groups/joins/';

    // Persist the split-mode preference using localStorage — no extra permission needed.
    const saved = localStorage.getItem('fbge_splitMode');
    if (saved !== null) splitModeCheckbox.checked = saved === 'true';

    splitModeCheckbox.addEventListener('change', function() {
        localStorage.setItem('fbge_splitMode', splitModeCheckbox.checked);
    });

    let exportRunning = false;

    function showCompletion(result) {
        if (!exportRunning) return; // already completed via the other channel
        exportRunning = false;
        setLoadingState(false);

        if (result && result.success !== false) {
            const count = result.count || 0;
            if (result.split && result.files > 1) {
                statusMessage.textContent = `✓ Exported ${count} groups across ${result.files} files!`;
            } else {
                statusMessage.textContent = `✓ Exported ${count} groups successfully!`;
            }
            statusMessage.className = 'success';
        } else {
            const errorMsg = (result && result.error) || 'Make sure you are on Facebook';
            statusMessage.textContent = '✗ ' + errorMsg;
            statusMessage.className = 'error';
        }
    }

    // Live progress + completion broadcast from the content script. Completion also
    // arrives via the sendResponse chain, but that chain can die with the MV3
    // service worker mid-scan — whichever signal lands first wins.
    chrome.runtime.onMessage.addListener(function(message) {
        if (!message) return;
        if (message.action === 'exportProgress') {
            const parts = message.parts > 0 ? ` (${message.parts} files downloaded)` : '';
            statusMessage.textContent = `Found ${message.count} groups so far…${parts}`;
            statusMessage.className = '';
        } else if (message.action === 'exportComplete') {
            showCompletion({ success: true, count: message.count, files: message.files, split: message.split });
        }
    });

    function setLoadingState(loading, text) {
        if (loading) {
            exportButton.classList.add('loading');
            exportButton.innerHTML = `
                <svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
                    <polyline points="7 10 12 15 17 10"></polyline>
                    <line x1="12" y1="15" x2="12" y2="3"></line>
                </svg>
                ${text || 'Exporting...'}
            `;
        } else {
            exportButton.classList.remove('loading');
            exportButton.innerHTML = `
                <svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
                    <polyline points="7 10 12 15 17 10"></polyline>
                    <line x1="12" y1="15" x2="12" y2="3"></line>
                </svg>
                Export Groups
            `;
        }
    }

    function triggerExport() {
        const splitMode = splitModeCheckbox.checked;
        exportRunning = true;
        setLoadingState(true, 'Scrolling...');
        statusMessage.textContent = 'Auto-scrolling to load all groups...';
        statusMessage.className = '';

        chrome.runtime.sendMessage({ action: 'exportGroups', splitMode: splitMode }, function(response) {
            // If the relay died (lastError / empty response), completion will
            // arrive via the exportComplete broadcast instead — don't show an error.
            if (chrome.runtime.lastError || !response) return;
            showCompletion(response);
        });
    }

    exportButton.addEventListener('click', function() {
        // Check if current tab is on the Facebook groups page
        chrome.tabs.query({ active: true, currentWindow: true }, function(tabs) {
            const currentUrl = tabs[0]?.url || '';
            
            // Check if we're on Facebook groups page
            if (currentUrl.includes('facebook.com/groups')) {
                // Already on groups page, export directly
                triggerExport();
            } else {
                // Navigate to groups page first
                setLoadingState(true, 'Navigating...');
                statusMessage.textContent = 'Opening Facebook Groups...';
                statusMessage.className = '';
                
                chrome.tabs.update(tabs[0].id, { url: GROUPS_URL }, function() {
                    // Wait for page to load, then show message
                    statusMessage.textContent = 'Page opened! Scroll down to load groups, then click Export again.';
                    statusMessage.className = 'success';
                    setLoadingState(false);
                });
            }
        });
    });
});