// This file contains the content script that runs in the context of Facebook's web pages.
// It interacts with the DOM to extract the user's groups' links and names.

// ─── Whitelist: Check if a group element belongs to a joined group ───────────
// Joined groups have "You last visited X days/weeks/months/years ago" or Hebrew equivalent
const isJoinedGroup = (element) => {
    let container = element;
    for (let i = 0; i < 10 && container; i++) {
        container = container.parentElement;
        if (!container) break;
        const text = container.textContent || '';
        const englishPattern = /You last visited.*?(day|week|month|year)s?\s+ago/i;
        const hebrewPattern = /הביקור האחרון שלך היה לפני.*?(יום|ימים|שבוע|שבועות|חודש|חודשים|שנה|שנים)/i;
        if (englishPattern.test(text) || hebrewPattern.test(text)) return true;
    }
    return false;
};

// ─── Blacklist: Check if a group element is a SUGGESTED (non-joined) group ──
// Returns true if the element looks like a suggested/non-joined group.
const isSuggestedGroup = (element) => {
    let container = element;
    for (let i = 0; i < 10 && container; i++) {
        container = container.parentElement;
        if (!container) break;

        const text = container.textContent || '';

        const englishSuggestionPatterns = [
            /Suggested for you/i,
            /Groups you might like/i,
            /Discover new groups/i,
            /Popular near you/i,
            /Friends in this group/i,
            /Members?\s*·\s*\d+\s*posts?\s*a\s*(day|week|month)/i,
        ];

        const hebrewSuggestionPatterns = [
            /מוצע עבורך/i,
            /מוצעות עבורך/i,
            /הצעות עבורך/i,
            /קבוצות שעשויות לעניין אותך/i,
            /קבוצות שאולי יעניינו אותך/i,
            /גלה קבוצות חדשות/i,
            /גלי קבוצות חדשות/i,
            /פופולרי באזורך/i,
            /פופולריות באזורך/i,
            /חברים בקבוצה הזו/i,
            /חברים בקבוצה הזאת/i,
        ];

        const joinButtons = container.querySelectorAll('div[role="button"], a[role="button"], button');
        for (const btn of joinButtons) {
            const btnText = (btn.textContent || '').trim();
            if (/^Join$/i.test(btnText) || /^הצטרפות$/i.test(btnText) || /^הצטרף$/i.test(btnText) || /^הצטרפי$/i.test(btnText)) {
                return true;
            }
        }

        for (const pattern of englishSuggestionPatterns) { if (pattern.test(text)) return true; }
        for (const pattern of hebrewSuggestionPatterns)  { if (pattern.test(text)) return true; }
    }
    return false;
};

// ─── Helpers ─────────────────────────────────────────────────────────────────
const randomDelay = (min, max) => Math.floor(Math.random() * (max - min + 1)) + min;
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const humanScroll = (targetY) => {
    window.scrollTo({ top: targetY, behavior: 'smooth' });
};

// ─── Core DOM scraper ────────────────────────────────────────────────────────
// Extracts raw group candidates from whatever is currently in the DOM.
const collectRawGroups = (filterFn) => {
    const groups = [];
    const seenLinks = new Set();

    document.querySelectorAll('a[href*="/groups/"]').forEach(element => {
        const href = element.href;
        const groupMatch = href.match(/facebook\.com\/groups\/([a-zA-Z0-9_.]+)\/?(?:[?#]|$)/);
        if (!groupMatch) return;

        const groupId = groupMatch[1];
        const excludedIds = ['feed', 'joins', 'discover', 'notifications', 'search', 'create'];
        if (excludedIds.includes(groupId)) return;
        if (filterFn && !filterFn(element)) return;

        const normalizedLink = `https://www.facebook.com/groups/${groupId}`;
        if (seenLinks.has(normalizedLink)) return;
        seenLinks.add(normalizedLink);

        // Name extraction — four strategies in priority order
        let groupName = element.textContent.trim();

        if (!groupName) groupName = element.getAttribute('aria-label') || '';

        if (!groupName) {
            const heading = element.querySelector('span, h1, h2, h3, h4, h5, h6');
            if (heading) groupName = heading.textContent.trim();
        }

        if (!groupName) {
            let parent = element.parentElement;
            for (let i = 0; i < 5 && parent; i++) {
                const el = parent.querySelector('span[dir="auto"], span[class*="name"], h3, h4');
                if (el && el.textContent.trim()) { groupName = el.textContent.trim(); break; }
                parent = parent.parentElement;
            }
        }

        // Strip activity timestamps Facebook appends to the name
        groupName = groupName
            .replace(/Last active.*$/i, '').replace(/Active \d+.*$/i, '')
            .replace(/Yesterday.*$/i, '').replace(/Today.*$/i, '')
            .replace(/\d+ (minutes?|hours?|days?|weeks?|months?) ago.*$/i, '')
            .replace(/\d+[hm] ago.*$/i, '').replace(/Just now.*$/i, '')
            .replace(/New activity.*$/i, '')
            .replace(/\d+ new (posts?|notifications?).*$/i, '')
            .replace(/You last visited.*$/i, '')
            .replace(/פעילות אחרונה.*$/i, '').replace(/פעיל לאחרונה.*$/i, '')
            .replace(/אתמול.*$/i, '').replace(/היום.*$/i, '')
            .replace(/לפני \d+ (דקות?|שעות?|ימים?|שבועות?|חודשים?).*$/i, '')
            .replace(/לפני דקה.*$/i, '').replace(/לפני שעה.*$/i, '')
            .replace(/לפני יום.*$/i, '').replace(/לפני שבוע.*$/i, '')
            .replace(/לפני חודש.*$/i, '').replace(/עכשיו.*$/i, '')
            .replace(/הרגע.*$/i, '').replace(/פעילות חדשה.*$/i, '')
            .replace(/\d+ (פוסטים?|התראות?) חדשים?.*$/i, '')
            .replace(/פוסט חדש.*$/i, '')
            .replace(/הביקור האחרון שלך היה לפני.*$/i, '')
            .trim();

        if (!groupName) groupName = groupId;
        if (groupName.length > 0) groups.push({ name: groupName, link: normalizedLink, groupId });
    });

    return groups;
};

// ─── Persistent accumulators ─────────────────────────────────────────────────
// Facebook renders the groups list as a virtualized list — cards that scroll
// out of view are removed from the DOM. To reliably export 1,000+ groups we
// harvest incrementally on every scroll step and accumulate here, keyed by
// groupId so duplicates are merged automatically.
const joinedGroups   = new Map(); // whitelist: groups with "last visited" text
const fallbackGroups = new Map(); // blacklist: everything except suggested groups

const mergeGroup = (map, group) => {
    const existing = map.get(group.groupId);
    if (!existing) { map.set(group.groupId, group); return; }
    // Upgrade a fallback (id-only) name with a real name found later
    if (existing.name === existing.groupId && group.name !== group.groupId) {
        map.set(group.groupId, group);
    }
};

const harvestVisibleGroups = () => {
    collectRawGroups(isJoinedGroup).forEach(g => mergeGroup(joinedGroups, g));
    collectRawGroups(el => !isSuggestedGroup(el)).forEach(g => mergeGroup(fallbackGroups, g));
    return Math.max(joinedGroups.size, fallbackGroups.size);
};

const resetAccumulators = () => { joinedGroups.clear(); fallbackGroups.clear(); };

const dedupeGroups = (groups) => {
    const seen = new Set();
    return groups.filter(g => {
        const key = g.groupId || g.link;
        if (seen.has(key)) return false;
        seen.add(key); return true;
    });
};

// ─── Scroll + incremental harvest ────────────────────────────────────────────
// Scrolls down in small overlapping steps, harvesting on each step.
const autoScrollAndHarvest = (onProgress) => new Promise((resolve) => {
    let cancelled = false;
    const safetyTimer = setTimeout(() => { cancelled = true; }, 600000); // 10 min cap

    const run = async () => {
        await sleep(2500); // let first batch render
        if (onProgress) onProgress(harvestVisibleGroups());

        const viewportHeight = window.innerHeight;
        let lastTotal = 0, noGrowthCount = 0, bottomStableCount = 0;
        const maxNoGrowth = 25;

        while (!cancelled) {
            const stepFactor = 0.7 + (Math.random() * 0.2);
            const step = Math.max(200, Math.floor(viewportHeight * stepFactor));
            const previousScrollY = window.scrollY;
            humanScroll(previousScrollY + step);

            await sleep(randomDelay(700, 1100));
            const total = harvestVisibleGroups();
            if (onProgress) onProgress(total);

            const reachedBottom = (window.innerHeight + window.scrollY) >= (document.body.scrollHeight - 2);
            const scrollMoved   = window.scrollY > previousScrollY + 1;

            if (total > lastTotal) { lastTotal = total; noGrowthCount = 0; }
            else { noGrowthCount++; }

            if (reachedBottom && !scrollMoved) {
                bottomStableCount++;
                await sleep(randomDelay(1200, 1800));
                const afterWait = harvestVisibleGroups();
                if (onProgress) onProgress(afterWait);
                if (afterWait > total) { bottomStableCount = 0; noGrowthCount = 0; lastTotal = afterWait; }
                if (bottomStableCount >= 3) break;
            } else {
                bottomStableCount = 0;
            }

            if (noGrowthCount >= maxNoGrowth) break;
        }

        clearTimeout(safetyTimer);
        resolve();
    };

    run();
});

// Sweeps back up to catch any cards skipped on the way down.
const sweepUpAndHarvest = (onProgress) => new Promise((resolve) => {
    const run = async () => {
        const viewportHeight = window.innerHeight;
        while (window.scrollY > 0) {
            const step = Math.max(200, Math.floor(viewportHeight * 0.8));
            humanScroll(Math.max(0, window.scrollY - step));
            await sleep(randomDelay(400, 700));
            if (onProgress) onProgress(harvestVisibleGroups());
        }
        humanScroll(0);
        await sleep(500);
        resolve();
    };
    run();
});

// ─── Export logic ─────────────────────────────────────────────────────────────
const GROUPS_PAGE_URL      = 'https://www.facebook.com/groups/joins/';
const GROUPS_PER_SPLIT_FILE = 150;

const isOnGroupsPage = () =>
    window.location.href.startsWith(GROUPS_PAGE_URL) ||
    window.location.href.startsWith('https://www.facebook.com/groups/joins');

const reportProgress = (total) => {
    try {
        chrome.runtime.sendMessage({ action: 'exportProgress', count: total }, () => {
            void chrome.runtime.lastError; // suppress "no receiving end" warning
        });
    } catch (e) { /* popup closed — harmless */ }
};

const resolveFinalGroups = () => {
    if (joinedGroups.size > 0) {
        console.log(`[FB Groups Exporter] Whitelist: ${joinedGroups.size} groups`);
        return dedupeGroups(Array.from(joinedGroups.values()));
    }
    console.log(`[FB Groups Exporter] Fallback: ${fallbackGroups.size} groups`);
    return dedupeGroups(Array.from(fallbackGroups.values()));
};

const downloadJSON = (jsonData, filename) => {
    const blob = new Blob([jsonData], { type: 'application/json' });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.href = url; a.download = filename;
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 10000);
};

const exportFilesInSplitMode = (groups) => {
    const totalFiles = Math.max(1, Math.ceil(groups.length / GROUPS_PER_SPLIT_FILE));
    for (let i = 0; i < totalFiles; i++) {
        const chunk = groups.slice(i * GROUPS_PER_SPLIT_FILE, (i + 1) * GROUPS_PER_SPLIT_FILE);
        const part  = String(i + 1).padStart(2, '0');
        const total = String(totalFiles).padStart(2, '0');
        setTimeout(() => {
            downloadJSON(JSON.stringify(chunk, null, 2), `facebook_groups_part_${part}_of_${total}.json`);
        }, i * 400);
    }
    return totalFiles;
};

const exportGroups = async ({ splitMode = false } = {}) => {
    if (!isOnGroupsPage()) throw new Error('Please navigate to your Facebook Groups page first');

    resetAccumulators();
    console.log('[FB Groups Exporter] Scrolling and harvesting groups incrementally...');
    await autoScrollAndHarvest(reportProgress);

    console.log('[FB Groups Exporter] Sweeping back up to catch any skipped groups...');
    await sweepUpAndHarvest(reportProgress);

    const groups = resolveFinalGroups();
    if (groups.length === 0) console.warn('[FB Groups Exporter] WARNING: No groups found.');

    const exportable = groups.map(({ name, link }) => ({ name, link }));

    if (splitMode) {
        const fileCount = exportFilesInSplitMode(exportable);
        console.log(`[FB Groups Exporter] Exported ${exportable.length} groups across ${fileCount} files`);
        return { count: exportable.length, files: fileCount, split: true };
    }

    downloadJSON(JSON.stringify(exportable, null, 2), 'facebook_groups.json');
    console.log(`[FB Groups Exporter] Exported ${exportable.length} groups`);
    return { count: exportable.length, files: 1, split: false };
};

// ─── Message listener ─────────────────────────────────────────────────────────
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === 'exportGroups') {
        const splitMode = request.splitMode === true;
        exportGroups({ splitMode })
            .then(result  => sendResponse({ success: true,  count: result.count, files: result.files, split: result.split }))
            .catch(error  => sendResponse({ success: false, error: error.message }));
        return true; // keep channel open for async response
    }
});