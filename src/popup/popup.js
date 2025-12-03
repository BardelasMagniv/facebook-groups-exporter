document.addEventListener('DOMContentLoaded', function() {
    const exportButton = document.getElementById('export-button');
    const statusMessage = document.getElementById('status-message');
    const GROUPS_URL = 'https://www.facebook.com/groups/joins/';

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
        setLoadingState(true, 'Exporting...');
        statusMessage.textContent = '';
        statusMessage.className = '';

        chrome.runtime.sendMessage({ action: 'exportGroups' }, function(response) {
            setLoadingState(false);

            if (response && response.success !== false) {
                statusMessage.textContent = '✓ Groups exported successfully!';
                statusMessage.className = 'success';
            } else {
                const errorMsg = response?.error || 'Make sure you are on Facebook';
                statusMessage.textContent = '✗ ' + errorMsg;
                statusMessage.className = 'error';
            }
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