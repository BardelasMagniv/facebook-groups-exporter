// This file contains the content script that runs in the context of Facebook's web pages.
// It interacts with the DOM to extract the user's groups' links and names.
//
// Performance model (v1.5): each group card is classified at most a few times, with a
// single bounded upward walk per anchor. Ancestor text reads stop at CARD_TEXT_CAP
// characters — beyond that we've left the card and would start serializing huge page
// subtrees, which is what froze v1.4.

// ─── Classification ──────────────────────────────────────────────────────────
const CARD_TEXT_CAP = 2000;   // a real card's text is a few hundred chars at most
const MAX_WALK_LEVELS = 10;
const MAX_CLASSIFY_ATTEMPTS = 3;

// Joined groups have "You last visited X days/weeks/months/years ago" or Hebrew equivalent
const JOINED_PATTERNS = [
    /You last visited.*?(day|week|month|year)s?\s+ago/i,
    /הביקור האחרון שלך היה לפני.*?(יום|ימים|שבוע|שבועות|חודש|חודשים|שנה|שנים)/i,
];

const SUGGESTED_TEXT_PATTERNS = [
    /Suggested for you/i,
    /Groups you might like/i,
    /Discover new groups/i,
    /Popular near you/i,
    /Friends in this group/i,
    /Members?\s*·\s*\d+\s*posts?\s*a\s*(day|week|month)/i,
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

const JOIN_BUTTON_PATTERN = /^(Join|הצטרפות|הצטרף|הצטרפי)$/i;

const GROUP_ID_RE = /facebook\.com\/groups\/([a-zA-Z0-9_.]+)\/?(?:[?#]|$)/;

// An ancestor holding links to more than one distinct group is past the card
// boundary — classification text read from it would leak between neighboring cards.
const spansMultipleGroups = (container) => {
    const ids = new Set();
    for (const anchor of container.querySelectorAll('a[href*="/groups/"]')) {
        const match = (anchor.href || '').match(GROUP_ID_RE);
        if (!match || EXCLUDED_GROUP_IDS.includes(match[1])) continue;
        ids.add(match[1]);
        if (ids.size > 1) return true;
    }
    return false;
};

// One upward walk per anchor: find the card root — the largest ancestor that still
// belongs to this card alone (single group id, text under the cap) — then run the
// joined/suggested checks once against that root.
const classifyAnchor = (element) => {
    let cardRoot = element;
    let container = element.parentElement;
    for (let i = 0; i < MAX_WALK_LEVELS && container; i++) {
        const text = container.textContent || '';
        if (text.length > CARD_TEXT_CAP) break;
        if (spansMultipleGroups(container)) break;
        cardRoot = container;
        container = container.parentElement;
    }

    const cardText = cardRoot.textContent || '';

    let joined = false;
    for (const pattern of JOINED_PATTERNS) {
        if (pattern.test(cardText)) { joined = true; break; }
    }

    let suggested = false;
    for (const pattern of SUGGESTED_TEXT_PATTERNS) {
        if (pattern.test(cardText)) { suggested = true; break; }
    }
    if (!suggested) {
        const buttons = cardRoot.querySelectorAll('div[role="button"], a[role="button"], button');
        for (const btn of buttons) {
            if (JOIN_BUTTON_PATTERN.test((btn.textContent || '').trim())) { suggested = true; break; }
        }
    }

    return { joined, suggested };
};

// ─── Helpers ─────────────────────────────────────────────────────────────────
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const instantScroll = (targetY) => {
    window.scrollTo({ top: targetY, behavior: 'instant' });
};

const groupAnchors = () => document.querySelectorAll('a[href*="/groups/"]');

// True if the DOM holds a group anchor we've never seen — content already rendered.
const hasFreshAnchor = () => {
    for (const anchor of groupAnchors()) {
        if (!anchorState.has(anchor)) return true;
    }
    return false;
};

// Resolves as soon as a node containing a group anchor is added to the page,
// or after capMs if nothing renders (e.g. we're at the true bottom).
const waitForNewAnchors = (capMs) => new Promise((resolve) => {
    let finished = false;
    const finish = (changed) => {
        if (finished) return;
        finished = true;
        observer.disconnect();
        clearTimeout(timer);
        resolve(changed);
    };
    const observer = new MutationObserver((mutations) => {
        for (const mutation of mutations) {
            for (const node of mutation.addedNodes) {
                if (node.nodeType !== 1) continue;
                if ((node.matches && node.matches('a[href*="/groups/"]')) ||
                    (node.querySelector && node.querySelector('a[href*="/groups/"]'))) {
                    finish(true);
                    return;
                }
            }
        }
    });
    observer.observe(document.body, { childList: true, subtree: true });
    const timer = setTimeout(() => finish(false), capMs);
});

// Adaptive post-scroll wait: proceed immediately if new cards are already in the
// DOM, otherwise wait only until the virtualized list actually renders them.
const settleAfterScroll = async (capMs) => {
    await sleep(40);
    if (hasFreshAnchor()) return;
    await waitForNewAnchors(capMs);
    await sleep(40);
};

// Like waitForNewAnchors, but also treats page-height growth as new content —
// Facebook grows the page before the appended cards' anchors attach.
const waitForGrowth = (capMs) => new Promise((resolve) => {
    let finished = false;
    const startHeight = document.body.scrollHeight;
    const finish = (grew) => {
        if (finished) return;
        finished = true;
        observer.disconnect();
        clearInterval(poller);
        clearTimeout(timer);
        resolve(grew);
    };
    const observer = new MutationObserver((mutations) => {
        for (const mutation of mutations) {
            for (const node of mutation.addedNodes) {
                if (node.nodeType !== 1) continue;
                if ((node.matches && node.matches('a[href*="/groups/"]')) ||
                    (node.querySelector && node.querySelector('a[href*="/groups/"]'))) {
                    finish(true);
                    return;
                }
            }
        }
    });
    observer.observe(document.body, { childList: true, subtree: true });
    const poller = setInterval(() => {
        if (document.body.scrollHeight > startHeight) finish(true);
    }, 150);
    const timer = setTimeout(() => finish(false), capMs);
});

// Facebook shows a spinner at the list bottom while a pagination fetch is in flight.
const isLoadingSpinnerVisible = () => {
    for (const el of document.querySelectorAll('[role="progressbar"]')) {
        const rect = el.getBoundingClientRect();
        if (rect.width > 0 && rect.height > 0) return true;
    }
    return false;
};

// Initial page settle: wait until the first batch of anchors exists at all.
const waitForFirstAnchors = async (capMs) => {
    const start = performance.now();
    while (performance.now() - start < capMs) {
        if (groupAnchors().length > 0) { await sleep(300); return; }
        await sleep(50);
    }
};

const EXCLUDED_GROUP_IDS = ['feed', 'joins', 'discover', 'notifications', 'search', 'create'];

const extractGroupName = (element, groupId) => {
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

    return groupName || groupId;
};

// ─── Persistent accumulator ──────────────────────────────────────────────────
// Facebook renders the groups list as a virtualized list — cards that scroll
// out of view are removed from the DOM. To reliably export 1,000+ groups we
// harvest incrementally on every scroll step and accumulate here, keyed by
// groupId so duplicates are merged automatically.
//
// ONE map feeds progress, split-mode streaming, and the final export alike, so
// the "N groups found" counter and the file contents cannot diverge. A group is
// collected when it is joined-marked OR simply not suggested: real cards often
// carry no "last visited" line at all, so that text is a positive override
// (protecting against suggested false-positives), never a requirement.
const collectedGroups = new Map();
const joinedMarked      = new Set(); // ids whose card carried "last visited" text (diagnostics)
const suggestedExcluded = new Set(); // ids excluded as suggested (diagnostics)

// Per-element classification state. Virtualization recreates DOM nodes, so this
// only bounds rework within a node's lifetime; the walk cap bounds cost overall.
// Entries are re-examined (up to MAX_CLASSIFY_ATTEMPTS) while a card is ambiguous —
// neither joined nor suggested, or name unresolved — to catch late-rendered text.
let anchorState = new WeakMap();

const mergeGroup = (map, group) => {
    const existing = map.get(group.groupId);
    if (!existing) { map.set(group.groupId, group); return; }
    // Upgrade a fallback (id-only) name with a real name found later
    if (existing.name === existing.groupId && group.name !== group.groupId) {
        existing.name = group.name;
    }
};

const harvestVisibleGroups = () => {
    groupAnchors().forEach(element => {
        const state = anchorState.get(element);
        if (state && state.done) return;

        const href = element.href;
        const groupMatch = href.match(/facebook\.com\/groups\/([a-zA-Z0-9_.]+)\/?(?:[?#]|$)/);
        if (!groupMatch) { anchorState.set(element, { done: true }); return; }

        const groupId = groupMatch[1];
        if (EXCLUDED_GROUP_IDS.includes(groupId)) { anchorState.set(element, { done: true }); return; }

        const groupName = extractGroupName(element, groupId);
        const { joined, suggested } = classifyAnchor(element);
        const group = {
            name: groupName,
            link: `https://www.facebook.com/groups/${groupId}`,
            groupId,
        };

        if (joined) joinedMarked.add(groupId);
        if (joined || !suggested) mergeGroup(collectedGroups, group);
        else suggestedExcluded.add(groupId);

        const attempts = (state ? state.attempts : 0) + 1;
        const resolved = (joined || suggested) && groupName !== groupId;
        anchorState.set(element, { done: resolved || attempts >= MAX_CLASSIFY_ATTEMPTS, attempts });
    });

    return collectedGroups.size;
};

const resetAccumulators = () => {
    collectedGroups.clear();
    joinedMarked.clear();
    suggestedExcluded.clear();
    anchorState = new WeakMap();
};

// ─── Scroll + incremental harvest ────────────────────────────────────────────
// Scrolls down in overlapping instant steps; after each step waits only until
// new content actually renders (adaptive — no fixed "human" delays).

// End-of-list patience. v1.5 gave up after ~4.5s at a stalled bottom, which is
// shorter than a throttled Facebook pagination fetch — exports stopped at a few
// hundred groups. These escalating waits only run at the bottom, so mid-scan
// speed is unaffected; the full sequence (~22s) is paid once, at the true end.
const BOTTOM_DRY_WAITS_MS = [2000, 4000, 8000, 8000];
const SPINNER_PATIENCE_MS = 45000;  // extra patience while FB shows its loading spinner
const NO_GROWTH_TIMEOUT_MS = 45000; // wedged-page safety net

const autoScrollAndHarvest = (onHarvest) => new Promise((resolve) => {
    let cancelled = false;
    const safetyTimer = setTimeout(() => { cancelled = true; }, 600000); // 10 min cap

    const run = async () => {
        await waitForFirstAnchors(2500);
        let total = harvestVisibleGroups();
        await onHarvest(total);

        const viewportHeight = window.innerHeight;
        const step = Math.max(200, Math.floor(viewportHeight * 0.85));
        let lastGrowthAt = performance.now();

        while (!cancelled) {
            const previousScrollY = window.scrollY;

            instantScroll(previousScrollY + step);
            await settleAfterScroll(700);

            const before = total;
            total = Math.max(total, harvestVisibleGroups());
            await onHarvest(total);
            if (total > before) lastGrowthAt = performance.now();

            const reachedBottom = (window.innerHeight + window.scrollY) >= (document.body.scrollHeight - 2);
            const scrollMoved   = window.scrollY > previousScrollY + 1;

            if (reachedBottom && !scrollMoved) {
                // Bottom of the currently-loaded list. Real pagination fetches can take
                // many seconds (Facebook throttles rapid successive fetches), and this
                // patience decides completeness: wait in escalating growth-aware rounds,
                // extended while a loading spinner is visible, and conclude end-of-list
                // only when every round comes up dry.
                let grew = false;
                let spinnerBudget = SPINNER_PATIENCE_MS;
                let round = 0;
                while (round < BOTTOM_DRY_WAITS_MS.length && !cancelled) {
                    const waitMs = BOTTOM_DRY_WAITS_MS[round];
                    const sawGrowth = await waitForGrowth(waitMs);
                    const now = harvestVisibleGroups();
                    await onHarvest(now);
                    if (now > total) { total = now; lastGrowthAt = performance.now(); grew = true; break; }
                    if (sawGrowth) { grew = true; break; }
                    if (isLoadingSpinnerVisible() && spinnerBudget > 0) { spinnerBudget -= waitMs; continue; }
                    round++;
                }
                if (!grew) break;
                continue;
            }

            // Safety net for a wedged page: no new groups anywhere for a long time.
            if (performance.now() - lastGrowthAt > NO_GROWTH_TIMEOUT_MS) break;
        }

        clearTimeout(safetyTimer);
        resolve();
    };

    run();
});

// Sweeps back up to catch any cards skipped on the way down.
const sweepUpAndHarvest = (onHarvest) => new Promise((resolve) => {
    const run = async () => {
        const viewportHeight = window.innerHeight;
        const step = Math.max(200, Math.floor(viewportHeight * 0.9));
        while (window.scrollY > 0) {
            instantScroll(Math.max(0, window.scrollY - step));
            await settleAfterScroll(150);
            await onHarvest(harvestVisibleGroups());
        }
        instantScroll(0);
        resolve();
    };
    run();
});

// ─── Export logic ─────────────────────────────────────────────────────────────
const GROUPS_PAGE_URL       = 'https://www.facebook.com/groups/joins/';
const GROUPS_PER_SPLIT_FILE = 150;

const isOnGroupsPage = () =>
    window.location.href.startsWith(GROUPS_PAGE_URL) ||
    window.location.href.startsWith('https://www.facebook.com/groups/joins');

const resolveFinalGroups = () => {
    console.log(`[FB Groups Exporter] Collected: ${collectedGroups.size} groups ` +
        `(with last-visited text: ${joinedMarked.size}, suggested excluded: ${suggestedExcluded.size})`);
    return Array.from(collectedGroups.values()); // keyed by groupId — already unique
};

// In-page fallback download, used only if the background downloads API fails.
const anchorDownload = (jsonData, filename) => {
    const blob = new Blob([jsonData], { type: 'application/json' });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.href = url; a.download = filename;
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 10000);
};

// Downloads go through the background service worker (chrome.downloads), which is
// immune to the "this site is downloading multiple files" prompt that can silently
// swallow mid-scan part files.
const requestDownload = (jsonData, filename) => new Promise((resolve) => {
    try {
        chrome.runtime.sendMessage({ action: 'downloadFile', filename, content: jsonData }, (response) => {
            if (chrome.runtime.lastError || !response || response.success !== true) {
                anchorDownload(jsonData, filename);
            }
            resolve();
        });
    } catch (e) {
        anchorDownload(jsonData, filename);
        resolve();
    }
});

const toExportable = (groups) => groups.map(({ name, link }) => ({ name, link }));

const partFilename = (partNumber) => `facebook_groups_part_${String(partNumber).padStart(2, '0')}.json`;

// ─── Incremental split-mode flusher ──────────────────────────────────────────
// Streams part files DURING the scan: as soon as 150 newly collected groups have
// accumulated, that part downloads immediately. The stream source is the same
// collectedGroups map that drives the progress counter, so every counted group
// lands in exactly one file. Groups whose name is still unresolved (name === id)
// are held back for a late name upgrade and flushed with the final remainder.
const createSplitFlusher = () => {
    const flushedIds = new Set();
    let partNumber = 0;

    const flush = async (final) => {
        const pending = [];
        for (const group of collectedGroups.values()) {
            if (flushedIds.has(group.groupId)) continue;
            if (!final && group.name === group.groupId) continue;
            pending.push(group);
        }
        while (pending.length >= GROUPS_PER_SPLIT_FILE || (final && pending.length > 0)) {
            const chunk = pending.splice(0, GROUPS_PER_SPLIT_FILE);
            partNumber++;
            chunk.forEach(g => flushedIds.add(g.groupId));
            await requestDownload(JSON.stringify(toExportable(chunk), null, 2), partFilename(partNumber));
        }
    };

    return {
        maybeFlush: () => flush(false),
        flushFinal: () => flush(true),
        get partCount() { return partNumber; },
        get flushedCount() { return flushedIds.size; },
    };
};

// ─── Progress reporting ──────────────────────────────────────────────────────
const PROGRESS_INTERVAL_MS = 250;

const createProgressReporter = () => {
    let lastSent = 0;
    return (count, parts) => {
        const now = performance.now();
        if (now - lastSent < PROGRESS_INTERVAL_MS) return;
        lastSent = now;
        try {
            chrome.runtime.sendMessage({ action: 'exportProgress', count, parts }, () => {
                void chrome.runtime.lastError; // suppress "no receiving end" warning
            });
        } catch (e) { /* popup closed — harmless */ }
    };
};

// Completion is broadcast fire-and-forget in addition to the sendResponse chain,
// because the MV3 service worker relaying the response can die mid-scan and
// silently drop the callback.
const broadcastComplete = (result) => {
    try {
        chrome.runtime.sendMessage({ action: 'exportComplete', ...result }, () => {
            void chrome.runtime.lastError;
        });
    } catch (e) { /* popup closed — harmless */ }
};

const exportGroups = async ({ splitMode = false } = {}) => {
    if (!isOnGroupsPage()) throw new Error('Please navigate to your Facebook Groups page first');

    resetAccumulators();
    const reportProgress = createProgressReporter();
    const flusher = splitMode ? createSplitFlusher() : null;

    const onHarvest = async (total) => {
        if (flusher) await flusher.maybeFlush();
        reportProgress(total, flusher ? flusher.partCount : 0);
    };

    console.log('[FB Groups Exporter] Scrolling and harvesting groups incrementally...');
    await autoScrollAndHarvest(onHarvest);

    console.log('[FB Groups Exporter] Sweeping back up to catch any skipped groups...');
    await sweepUpAndHarvest(onHarvest);

    const groups = resolveFinalGroups();
    if (groups.length === 0) console.warn('[FB Groups Exporter] WARNING: No groups found.');

    let result;
    if (splitMode) {
        await flusher.flushFinal();
        result = { count: flusher.flushedCount, files: flusher.partCount, split: true };
        console.log(`[FB Groups Exporter] Exported ${result.count} groups across ${result.files} files`);
    } else {
        const exportable = toExportable(groups);
        await requestDownload(JSON.stringify(exportable, null, 2), 'facebook_groups.json');
        result = { count: exportable.length, files: 1, split: false };
        console.log(`[FB Groups Exporter] Exported ${result.count} groups`);
    }

    broadcastComplete(result);
    return result;
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
