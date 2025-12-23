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

// Helper to add random variation (makes behavior more human-like)
const randomDelay = (min, max) => Math.floor(Math.random() * (max - min + 1)) + min;

// Simulate human-like smooth scroll using smooth behavior
const humanScroll = (targetY) => {
    window.scrollTo({
        top: targetY,
        behavior: 'smooth'
    });
};

// Auto-scroll to load all groups with human-like behavior
const autoScrollAndLoad = () => {
    return new Promise((resolve) => {
        let previousHeight = 0;
        let noChangeCount = 0;
        const maxNoChangeAttempts = 5; // Stop after 5 attempts with no new content
        
        const scrollStep = () => {
            // Add random variation to scroll distance (80-100% of remaining height)
            const scrollVariation = 0.8 + (Math.random() * 0.2);
            const targetScroll = document.body.scrollHeight * scrollVariation;
            
            // Use smooth scrolling
            humanScroll(targetScroll);
            
            // Random delay between scrolls (1.2-2.0 seconds) - more human-like
            const delay = randomDelay(1200, 2000);
            
            setTimeout(() => {
                const currentHeight = document.body.scrollHeight;
                
                if (currentHeight === previousHeight) {
                    noChangeCount++;
                    
                    if (noChangeCount >= maxNoChangeAttempts) {
                        // Scroll back to top smoothly
                        humanScroll(0);
                        setTimeout(() => resolve(), 1000);
                        return;
                    }
                } else {
                    noChangeCount = 0;
                    previousHeight = currentHeight;
                }
                
                // Continue scrolling
                scrollStep();
            }, delay);
        };
        
        // Start scrolling
        scrollStep();
        
        // Safety timeout - max 3 minutes of scrolling for large group lists
        setTimeout(() => {
            humanScroll(0);
            setTimeout(() => resolve(), 1000);
        }, 180000);
    });
};

// Scroll through the page to ensure all content is rendered before collecting
const scrollThroughPage = () => {
    return new Promise((resolve) => {
        const totalHeight = document.body.scrollHeight;
        const viewportHeight = window.innerHeight;
        let currentPosition = 0;
        
        const scrollStep = () => {
            // Random scroll distance (40-60% of viewport) - more human-like
            const stepVariation = 0.4 + (Math.random() * 0.2);
            const step = viewportHeight * stepVariation;
            currentPosition += step;
            
            // Use smooth scrolling
            humanScroll(currentPosition);
            
            // Random delay between scroll steps (250-450ms)
            const delay = randomDelay(250, 450);
            
            setTimeout(() => {
                if (currentPosition >= totalHeight) {
                    humanScroll(0);
                    setTimeout(() => resolve(), 500);
                } else {
                    scrollStep();
                }
            }, delay);
        };
        
        // Start scrolling
        scrollStep();
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
            
            // Get the group name - try multiple strategies
            let groupName = '';
            
            // Strategy 1: Try the link's text content
            groupName = element.textContent.trim();
            
            // Strategy 2: If empty, try aria-label attribute
            if (!groupName || groupName.length === 0) {
                groupName = element.getAttribute('aria-label') || '';
            }
            
            // Strategy 3: Look for a heading or span within the link
            if (!groupName || groupName.length === 0) {
                const heading = element.querySelector('span, h1, h2, h3, h4, h5, h6');
                if (heading) {
                    groupName = heading.textContent.trim();
                }
            }
            
            // Strategy 4: Look in parent container for the group name
            if (!groupName || groupName.length === 0) {
                let parent = element.parentElement;
                for (let i = 0; i < 5 && parent; i++) {
                    // Look for a span or heading that might contain the group name
                    const nameElement = parent.querySelector('span[dir="auto"], span[class*="name"], h3, h4');
                    if (nameElement && nameElement.textContent.trim().length > 0) {
                        groupName = nameElement.textContent.trim();
                        break;
                    }
                    parent = parent.parentElement;
                }
            }
            
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
                .replace(/You last visited.*$/i, '')
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
                .replace(/הביקור האחרון שלך היה לפני.*$/i, '')
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
    
    console.log('Scrolling through page to ensure content is rendered...');
    
    // Scroll through page slowly to ensure all content is rendered
    await scrollThroughPage();
    
    console.log('Collecting groups...');
    
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