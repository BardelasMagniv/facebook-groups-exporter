// This file contains the content script that runs in the context of Facebook's web pages.
// It interacts with the DOM to extract the user's groups' links and names.

// Check if a group element belongs to a joined group (not a suggested group)
// Joined groups have "You last visited X days/weeks/months/years ago" or Hebrew equivalent
const isJoinedGroup = (element) => {
    // Walk up the DOM to find the group card container (limit to 10 levels)
    let container = element;
    for (let i = 0; i < 10 && container; i++) {
        container = container.parentElement;
        if (!container) break;
        
        const text = container.textContent || '';
        
        // English pattern: "You last visited X days/weeks/months/years ago"
        const englishPattern = /You last visited.*?(day|week|month|year)s?\s+ago/i;
        
        // Hebrew pattern: "הביקור האחרון שלך היה לפני X ימים/שבועות/חודשים/שנים"
        const hebrewPattern = /הביקור האחרון שלך היה לפני.*?(יום|ימים|שבוע|שבועות|חודש|חודשים|שנה|שנים)/i;
        
        if (englishPattern.test(text) || hebrewPattern.test(text)) {
            return true;
        }
    }
    
    return false;
};

// Auto-scroll to load all groups
const autoScrollAndLoad = () => {
    return new Promise((resolve) => {
        let previousHeight = 0;
        let noChangeCount = 0;
        const maxNoChangeAttempts = 5; // Stop after 5 attempts with no new content
        const scrollDelay = 1000; // Wait 1 second between scrolls
        
        const scrollInterval = setInterval(() => {
            // Scroll to bottom
            window.scrollTo(0, document.body.scrollHeight);
            
            // Check if page height changed (new content loaded)
            const currentHeight = document.body.scrollHeight;
            
            if (currentHeight === previousHeight) {
                noChangeCount++;
                
                // If no new content after several attempts, we're done
                if (noChangeCount >= maxNoChangeAttempts) {
                    clearInterval(scrollInterval);
                    // Scroll back to top
                    window.scrollTo(0, 0);
                    resolve();
                }
            } else {
                // New content loaded, reset counter
                noChangeCount = 0;
                previousHeight = currentHeight;
            }
        }, scrollDelay);
        
        // Safety timeout - max 2 minutes of scrolling
        setTimeout(() => {
            clearInterval(scrollInterval);
            window.scrollTo(0, 0);
            resolve();
        }, 120000);
    });
};

const collectGroups = () => {
    const groups = [];
    const seenLinks = new Set();
    
    // Find all group links
    const groupElements = document.querySelectorAll('a[href*="/groups/"]');

    groupElements.forEach(element => {
        const href = element.href;
        
        // Only match direct group links like facebook.com/groups/123456 or facebook.com/groups/groupname
        // Exclude links with extra paths like /groups/feed/, /groups/joins/, /groups/discover/
        const groupMatch = href.match(/facebook\.com\/groups\/([a-zA-Z0-9_.]+)\/?$/);
        
        if (groupMatch) {
            const groupId = groupMatch[1];
            
            // Skip system pages
            const excludedIds = ['feed', 'joins', 'discover', 'notifications', 'search', 'create'];
            if (excludedIds.includes(groupId)) {
                return;
            }
            
            // Skip suggested groups - only include groups the user is a member of
            if (!isJoinedGroup(element)) {
                return;
            }
            
            // Normalize the link
            const normalizedLink = `https://www.facebook.com/groups/${groupId}`;
            
            // Skip duplicates
            if (seenLinks.has(normalizedLink)) {
                return;
            }
            seenLinks.add(normalizedLink);
            
            // Get the group name - try to find meaningful text
            let groupName = element.textContent.trim();
            
            // Remove "Last active" or activity timestamps that Facebook appends
            // English patterns
            groupName = groupName
                .replace(/Last active.*$/i, '')
                .replace(/Active \d+.*$/i, '')
                .replace(/Yesterday.*$/i, '')
                .replace(/Today.*$/i, '')
                .replace(/\d+ (minutes?|hours?|days?|weeks?|months?) ago.*$/i, '')
                .replace(/\d+[hm] ago.*$/i, '')
                .replace(/Just now.*$/i, '')
                .replace(/New activity.*$/i, '')
                .replace(/\d+ new (posts?|notifications?).*$/i, '')
                // Hebrew patterns (פעילות אחרונה = last active, אתמול = yesterday, היום = today, etc.)
                .replace(/פעילות אחרונה.*$/i, '')
                .replace(/פעיל לאחרונה.*$/i, '')
                .replace(/אתמול.*$/i, '')
                .replace(/היום.*$/i, '')
                .replace(/לפני \d+ (דקות?|שעות?|ימים?|שבועות?|חודשים?).*$/i, '')
                .replace(/לפני דקה.*$/i, '')
                .replace(/לפני שעה.*$/i, '')
                .replace(/לפני יום.*$/i, '')
                .replace(/לפני שבוע.*$/i, '')
                .replace(/לפני חודש.*$/i, '')
                .replace(/עכשיו.*$/i, '')
                .replace(/הרגע.*$/i, '')
                .replace(/פעילות חדשה.*$/i, '')
                .replace(/\d+ (פוסטים?|התראות?) חדשים?.*$/i, '')
                .replace(/פוסט חדש.*$/i, '')
                .trim();
            
            // Skip if no name or name is just whitespace/empty
            if (!groupName || groupName.length === 0) {
                groupName = groupId; // Fallback to group ID
            }
            
            // Skip very short or likely non-group names
            if (groupName.length > 0) {
                groups.push({ 
                    name: groupName, 
                    link: normalizedLink,
                    groupId: groupId
                });
            }
        }
    });

    return groups;
};

const GROUPS_PAGE_URL = 'https://www.facebook.com/groups/joins/';

// Check if we're on the correct Facebook groups page
const isOnGroupsPage = () => {
    return window.location.href.startsWith(GROUPS_PAGE_URL) || 
           window.location.href.startsWith('https://www.facebook.com/groups/joins');
};

const exportGroups = async () => {
    // Verify we're on the correct page
    if (!isOnGroupsPage()) {
        throw new Error('Please navigate to your Facebook Groups page first');
    }
    
    console.log('Starting auto-scroll to load all groups...');
    
    // Auto-scroll to load all groups
    await autoScrollAndLoad();
    
    console.log('Finished scrolling, collecting groups...');
    
    // Collect all groups
    const groups = collectGroups();
    
    // Export to JSON
    const jsonGroups = JSON.stringify(groups, null, 2);
    downloadJSON(jsonGroups, 'facebook_groups.json');
    
    console.log(`Exported ${groups.length} groups`);
    
    return groups.length;
};

const downloadJSON = (jsonData, filename) => {
    const blob = new Blob([jsonData], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
};

// Listen for messages from the popup to trigger the export
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === 'exportGroups') {
        // Use async/await with the response
        exportGroups().then((count) => {
            sendResponse({ success: true, count: count });
        }).catch((error) => {
            sendResponse({ success: false, error: error.message });
        });
        return true; // Keep message channel open for async response
    }
});