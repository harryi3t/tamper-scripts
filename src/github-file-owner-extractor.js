// ==UserScript==
// @name         GitHub File Owner Extractor
// @namespace    http://tampermonkey.net/
// @version      0.1
// @description  Extract and log file owner information from GitHub PR file view pages
// @match        https://github.com/*/pull/*/files*
// @grant        none
// ==/UserScript==

(function () {
    'use strict';

    const DEBUG = true;

    function debug(...args) {
        if (DEBUG) {
            console.log('[GitHub File Owner Extractor]', ...args);
        }
    }

    debug('Script loaded on GitHub PR files page');

    // In-memory state for UI filters
    const filterState = {
        selectedOwners: new Set(),
        lastOwnerToFilesMap: new Map(),
        ownerToContainers: new Map(),
        allContainers: new Set(),
    };

    function extractFileOwners() {
        debug('Starting file owner extraction...');

        // Find all file headers with aria-label attributes
        const fileHeaders = document.querySelectorAll('[aria-label*="Owned by"]');
        debug(`Found ${fileHeaders.length} file headers with owner information`);

        const ownerToFilesMap = new Map();

        fileHeaders.forEach((header, index) => {
            const ariaLabel = header.getAttribute('aria-label');
            if (!ariaLabel) return;

            // Extract owners from aria-label
            const ownerInfo = parseAriaLabel(ariaLabel);
            if (ownerInfo) {
                const {
                    owners
                } = ownerInfo;

                // Try to find the file path from the element or its context
                const filePath = getFilePathFromElement(header);

                if (filePath) {
                    // Add each owner to the map with their files
                    owners.forEach(owner => {
                        if (!ownerToFilesMap.has(owner)) {
                            ownerToFilesMap.set(owner, new Set());
                        }
                        ownerToFilesMap.get(owner).add(filePath);
                    });

                    // Index containers per owner for fast show/hide
                    // Prefer the parent wrapper of the region so the space collapses completely
                    const region = header.closest('[role="region"]');
                    const hideContainer = region && region.parentElement ? region.parentElement : (region || getFileContainerFromHeader(header));
                    if (hideContainer) {
                        filterState.allContainers.add(hideContainer);
                        owners.forEach(owner => {
                            if (!filterState.ownerToContainers.has(owner)) {
                                filterState.ownerToContainers.set(owner, new Set());
                            }
                            filterState.ownerToContainers.get(owner).add(hideContainer);
                        });
                    }
                }
            }
        });

        // Print the owner → files mapping
        if (ownerToFilesMap.size === 0) {
            debug('No file ownership information found.');
        } else {
            debug('📋 File Ownership:', ownerToFilesMap);
        }

        debug(`\n📊 Summary: ${ownerToFilesMap.size} owners found across ${Array.from(ownerToFilesMap.values()).reduce((total, files) => total + files.size, 0)} files`);

        // Save to state for UI usage
        filterState.lastOwnerToFilesMap = ownerToFilesMap;
        // Attempt UI render/update if filter modal is present
        tryRenderOwnerFilters();
        return ownerToFilesMap;
    }

    function getFilePathFromElement(element) {
        // Try to find the file path from the element's context
        // Look for common patterns in GitHub's PR file view

        // Method 1: Look for a link or text within the same file header container
        const container = element.closest('[data-testid="file-header"]') ||
            element.closest('.file-header') ||
            element.closest('.file') ||
            element.parentElement;

        if (container) {
            // Look for file path in various possible selectors
            const pathSelectors = [
                'a[title]', // File links often have title attribute with full path
                '.file-info a',
                '[data-testid="file-name"]',
                '.file-name',
                'a[href*="/blob/"]', // GitHub blob links
                'span[title]' // Sometimes the path is in a span title
            ];

            for (const selector of pathSelectors) {
                const pathElement = container.querySelector(selector);
                if (pathElement) {
                    // Try title attribute first, then text content
                    const path = pathElement.getAttribute('title') ||
                        (pathElement.textContent && pathElement.textContent.trim());
                    if (path && (path.includes('/') || path.includes('.'))) {
                        return path;
                    }
                }
            }
        }

        // Method 2: Look in siblings or nearby elements
        const siblings = (element.parentElement && element.parentElement.children) || [];
        for (const sibling of siblings) {
            if (sibling !== element) {
                const text = sibling.textContent && sibling.textContent.trim();
                if (text && (text.includes('/') || text.includes('.'))) {
                    return text;
                }
            }
        }

        return null;
    }

    function getFileContainerFromHeader(header) {
        if (!header) return null;
        // Try to reach the diff container for the file
        const region = header.closest('[role="region"]');
        if (region) return region;
        const diffTargetable = header.closest('[class*="Diff-module__diffTargetable"], [class*="diffTargetable"], [class*="diff-targetable"], .file');
        if (diffTargetable) return diffTargetable;
        return header.parentElement;
    }

    function parseAriaLabel(ariaLabel) {
        // The aria-label format appears to be something like:
        // "Owned by you along with @Rippling/spend-fe-reviewers (from CODEOWNERS line 354)"
        // We need to extract the owner information

        // Pattern to match "Owned by [owners] (from CODEOWNERS line X)"
        const ownerMatch = ariaLabel.match(/^Owned by (.+?) \(from CODEOWNERS line \d+\)$/);
        if (!ownerMatch) {
            return null;
        }

        const ownersString = ownerMatch[1].trim();

        // Parse the owners string - it can contain "you" and team mentions like "@Rippling/spend-fe-reviewers"
        // Split by "along with" and "and" to handle multiple owners
        let owners = [];

        // Split by common separators
        const parts = ownersString.split(/\s+along with\s+|\s+and\s+|,\s*/);

        parts.forEach(part => {
            const trimmed = part.trim();
            if (trimmed) {
                owners.push(trimmed);
            }
        });

        return {
            owners
        };
    }

    // ---------- UI: Inject owner filters into GitHub's filter modal ----------
    function findFilterListContainer() {
        // Heuristic: find the existing "Only files owned by you" option and use its list container
        const candidateLabels = Array.from(document.querySelectorAll('label, div, span'))
            .filter(el => /Only files owned by you/i.test(el.textContent || ''));

        for (const el of candidateLabels) {
            // Try common GitHub menu containers
            const container = el.closest('[role="menu"], .SelectMenu-list, .ActionList, .filter-list, [data-overlay-container], [data-menu]');
            if (container) {
                return { container, anchor: el.closest('label') || el };
            }
        }
        return null;
    }

    function createOwnerFilterItem(owner, count, isSelected) {
        const item = document.createElement('label');
        item.className = 'tm-owner-filter-item SelectMenu-item ActionListItem d-flex flex-justify-between';
        item.style.cursor = 'pointer';
        item.dataset.owner = owner;

        const left = document.createElement('span');
        left.textContent = `Files owned by "${owner}" (${count})`;
        left.style.display = 'inline-block';

        const right = document.createElement('span');
        right.className = 'tm-owner-filter-check';
        right.textContent = '✓';
        right.style.opacity = isSelected ? '1' : '0';
        right.style.transition = 'opacity 0.15s ease';

        item.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            if (filterState.selectedOwners.has(owner)) {
                filterState.selectedOwners.delete(owner);
                right.style.opacity = '0';
            } else {
                filterState.selectedOwners.add(owner);
                right.style.opacity = '1';
            }
            debug('Owner filter toggled', owner, Array.from(filterState.selectedOwners));
            applyOwnerOwnerFiltersImmediate();
        });

        item.appendChild(left);
        item.appendChild(right);
        return item;
    }

    function applyOwnerOwnerFiltersImmediate() {
        const selectedOwners = Array.from(filterState.selectedOwners);
        // If nothing selected: show all
        if (selectedOwners.length === 0) {
            filterState.allContainers.forEach(el => {
                if (el && el.style) el.style.display = '';
            });
            return;
        }
        // Build visible set
        const visible = new Set();
        selectedOwners.forEach(owner => {
            const set = filterState.ownerToContainers.get(owner);
            if (set) set.forEach(el => visible.add(el));
        });
        // Hide all, show visible
        filterState.allContainers.forEach(el => {
            if (!el || !el.style) return;
            el.style.display = visible.has(el) ? '' : 'none';
        });
    }

    function renderOwnerFilters(intoContainer, afterAnchor, ownerToFilesMap) {
        // Clear any previously injected items
        Array.from(intoContainer.querySelectorAll('.tm-owner-filter-item, .tm-owner-filter-sep')).forEach(n => n.remove());

        // Insert a separator after anchor for clarity
        const sep = document.createElement('div');
        sep.className = 'tm-owner-filter-sep';
        sep.style.borderTop = '1px solid var(--borderColor-muted, #d0d7de)';
        sep.style.margin = '6px 0';

        if (afterAnchor && afterAnchor.parentElement === intoContainer) {
            afterAnchor.insertAdjacentElement('afterend', sep);
        } else {
            intoContainer.appendChild(sep);
        }

        // Sort owners by name for stable order and omit the built-in "you" option
        const owners = Array
            .from(ownerToFilesMap.keys())
            .filter(o => (o || '').trim().toLowerCase() !== 'you')
            .sort((a, b) => a.localeCompare(b));

        // If no owners to render (e.g., only "you" exists), remove the separator and return
        if (owners.length === 0) {
            sep.remove();
            return;
        }

        owners.forEach((owner) => {
            const filesSet = ownerToFilesMap.get(owner) || new Set();
            const item = createOwnerFilterItem(owner, filesSet.size, filterState.selectedOwners.has(owner));
            sep.insertAdjacentElement('afterend', item);
        });

        debug('Rendered owner filters', owners);
    }

    function tryRenderOwnerFilters() {
        const found = findFilterListContainer();
        if (!found) {
            return;
        }
        const { container, anchor } = found;
        if (!(filterState.lastOwnerToFilesMap && filterState.lastOwnerToFilesMap.size > 0)) {
            return;
        }
        renderOwnerFilters(container, anchor, filterState.lastOwnerToFilesMap);
    }

    // ---------- UI: Toggle collapse/expand all files in PR diff ----------
    function getExpandedFileToggleButtons() {
        // Expanded state has the per-file button labeled "Collapse file: <path>"
        return Array.from(document.querySelectorAll('button[aria-label^="Collapse file:"]'));
    }

    function getCollapsedFileToggleButtons() {
        // Collapsed state has the per-file button labeled "Expand file: <path>"
        return Array.from(document.querySelectorAll('button[aria-label^="Expand file:"]'));
    }

    function areAllFilesCollapsed() {
        const expanded = getExpandedFileToggleButtons();
        const collapsed = getCollapsedFileToggleButtons();
        // All collapsed if there are zero expanded and at least one collapsed button present
        return expanded.length === 0 && collapsed.length > 0;
    }

    function createChevronSVG(direction) {
        const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
        svg.setAttribute('aria-hidden', 'true');
        svg.setAttribute('focusable', 'false');
        svg.setAttribute('class', `octicon ${direction === 'right' ? 'octicon-chevron-right' : 'octicon-chevron-down'}`);
        svg.setAttribute('viewBox', '0 0 16 16');
        svg.setAttribute('width', '16');
        svg.setAttribute('height', '16');
        svg.setAttribute('fill', 'currentColor');
        svg.setAttribute('display', 'inline-block');
        svg.setAttribute('overflow', 'visible');
        svg.setAttribute('style', 'vertical-align: text-bottom;');

        const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
        if (direction === 'right') {
            path.setAttribute('d', 'M6.22 3.22a.75.75 0 0 1 1.06 0l4.25 4.25a.75.75 0 0 1 0 1.06l-4.25 4.25a.751.751 0 0 1-1.042-.018.751.751 0 0 1-.018-1.042L9.94 8 6.22 4.28a.75.75 0 0 1 0-1.06Z');
        } else {
            path.setAttribute('d', 'M12.78 5.22a.749.749 0 0 1 0 1.06l-4.25 4.25a.749.749 0 0 1-1.06 0L3.22 6.28a.749.749 0 1 1 1.06-1.06L8 8.939l3.72-3.719a.749.749 0 0 1 1.06 0Z');
        }
        svg.appendChild(path);
        return svg;
    }

    function setToggleAllButtonContent(buttonEl, label, direction) {
        if (!buttonEl) return;
        // Build GitHub-like button content with leading icon and text
        const content = document.createElement('span');
        content.setAttribute('data-component', 'buttonContent');
        content.setAttribute('data-align', 'start');
        content.className = 'prc-Button-ButtonContent-HKbr-';

        const leading = document.createElement('span');
        leading.setAttribute('data-component', 'leadingVisual');
        leading.className = 'prc-Button-Visual-2epfX prc-Button-VisualWrap-Db-eB';
        leading.appendChild(createChevronSVG(direction));

        const text = document.createElement('span');
        text.setAttribute('data-component', 'text');
        text.className = 'prc-Button-Label-pTQ3x';
        text.textContent = label;

        content.appendChild(leading);
        content.appendChild(text);

        buttonEl.innerHTML = '';
        buttonEl.appendChild(content);
    }

    function updateToggleAllButtonVisual(buttonEl) {
        if (!buttonEl) return;
        // Determine state: if any expanded, action is to collapse all; else expand all
        const hasAnyExpanded = getExpandedFileToggleButtons().length > 0;
        const action = hasAnyExpanded ? 'collapse' : 'expand';
        const title = action === 'collapse' ? 'Collapse all files' : 'Expand all files';
        const label = action === 'collapse' ? 'Collapse' : 'Expand';
        const direction = action === 'collapse' ? 'down' : 'right';

        buttonEl.setAttribute('aria-label', title);
        buttonEl.setAttribute('title', title);
        setToggleAllButtonContent(buttonEl, label, direction);
    }

    function performToggleAllFiles() {
        const expanded = getExpandedFileToggleButtons();
        const collapsed = getCollapsedFileToggleButtons();
        if (expanded.length > 0) {
            debug(`Collapsing ${expanded.length} files`);
            expanded.forEach(btn => btn.click());
        } else if (collapsed.length > 0) {
            debug(`Expanding ${collapsed.length} files`);
            collapsed.forEach(btn => btn.click());
        } else {
            debug('No per-file expand/collapse buttons found');
        }
        // After DOM updates settle, refresh the icon/tooltip
        setTimeout(() => {
            document.querySelectorAll('[data-tm-toggle-all-files="true"]').forEach(el => updateToggleAllButtonVisual(el));
        }, 200);
    }

    function ensureToggleAllButtonInToolbar(toolbarRoot) {
        if (!toolbarRoot) return;
        // Find the "All changes" button within this toolbar root
        const allChangeButtons = Array.from(toolbarRoot.querySelectorAll('button'))
            .filter(b => (b.textContent || '').trim() === 'All changes');
        if (allChangeButtons.length === 0) {
            return;
        }

        const anchorButton = allChangeButtons[0];
        // Avoid duplicating in the same container
        const existing = anchorButton.parentElement && anchorButton.parentElement.querySelector('[data-tm-toggle-all-files="true"]');
        if (existing) {
            updateToggleAllButtonVisual(existing);
            return;
        }

        const btn = document.createElement('button');
        // Match bordered button styling similar to "All changes" / "Comments"
        btn.className = 'prc-Button-ButtonBase-c50BI flex-shrink-0';
        btn.type = 'button';
        btn.setAttribute('data-tm-toggle-all-files', 'true');
        btn.setAttribute('data-loading', 'false');
        btn.setAttribute('data-size', 'small');
        btn.setAttribute('data-variant', 'default');
        // Add some spacing from the previous button
        btn.style.marginLeft = '6px';
        updateToggleAllButtonVisual(btn);

        btn.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            performToggleAllFiles();
        });

        // Ensure the parent container lays out children horizontally
        const parent = anchorButton.parentElement;
        if (parent && parent.className && parent.className.includes('PullRequestFilesToolbar-module__hide-when-stuck')) {
            parent.style.display = 'flex';
        }

        // Place right after the anchor to sit adjacent in the same row
        anchorButton.insertAdjacentElement('afterend', btn);
        debug('Injected Toggle All Files button');
    }

    function ensureToggleAllButtons() {
        // The toolbar appears as a section with class containing PullRequestFilesToolbar-module__toolbar
        const toolbars = Array.from(document.querySelectorAll('section[class*="PullRequestFilesToolbar-module__toolbar"]'));
        if (toolbars.length === 0) return;
        toolbars.forEach(tb => ensureToggleAllButtonInToolbar(tb));
    }

    function observePageChanges() {
        // Create a MutationObserver to watch for dynamically loaded content
        const observer = new MutationObserver((mutations) => {
            let shouldExtract = false;
            let shouldRenderFilters = false;
            let shouldEnsureToggle = false;

            mutations.forEach((mutation) => {
                if (mutation.type === 'childList' && mutation.addedNodes.length > 0) {
                    // Check if any added nodes contain file headers
                    mutation.addedNodes.forEach((node) => {
                        if (node.nodeType === Node.ELEMENT_NODE) {
                            const numOfFileHeaders = node.querySelectorAll('[aria-label*="Owned by"]').length;
                            const hasFileHeaders = node.querySelectorAll && numOfFileHeaders > 0;
                            if (hasFileHeaders) {
                                shouldExtract = true;
                            }
                            // Also check if filter menu appeared
                            if (!shouldRenderFilters && /Only files owned by you/i.test(node.textContent || '')) {
                                shouldRenderFilters = true;
                            }
                            // Check for toolbar or file toggle buttons to manage our toggle-all button
                            if (!shouldEnsureToggle) {
                                const hasToolbar = node.matches && (node.matches('section[class*="PullRequestFilesToolbar-module__toolbar"]') || !!node.querySelector('section[class*="PullRequestFilesToolbar-module__toolbar"]'));
                                const hasFileToggles = node.querySelectorAll && (node.querySelectorAll('button[aria-label^="Collapse file:"], button[aria-label^="Expand file:"]').length > 0);
                                if (hasToolbar || hasFileToggles) {
                                    shouldEnsureToggle = true;
                                }
                            }
                        }
                    });
                }
            });

            if (shouldExtract) {
                const totalFileHeaders = document.querySelectorAll('[aria-label*="Owned by"]').length;
                debug('Detected new file content, re-extracting owners...', totalFileHeaders);

                setTimeout(extractFileOwners, 100); // Small delay to ensure DOM is settled
            }

            if (shouldRenderFilters) {
                // Attempt to render owner filters when the filter menu is opened/changed
                setTimeout(tryRenderOwnerFilters, 100);
            }

            if (shouldEnsureToggle) {
                setTimeout(() => {
                    ensureToggleAllButtons();
                    document.querySelectorAll('[data-tm-toggle-all-files="true"]').forEach(el => updateToggleAllButtonVisual(el));
                }, 100);
            }
        });

        // Start observing
        observer.observe(document.body, {
            childList: true,
            subtree: true
        });

        debug('Started observing page for dynamic content changes');
    }

    // Initialize the script
    function init() {
        debug('Initializing GitHub File Owner Extractor...');

        // Initial extraction
        setTimeout(() => {
            extractFileOwners();
            ensureToggleAllButtons();
            document.querySelectorAll('[data-tm-toggle-all-files="true"]').forEach(el => updateToggleAllButtonVisual(el));
        }, 1000); // Wait a bit for page to load

        // Set up observer for dynamic content
        observePageChanges();
    }

    // Start when DOM is ready
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }

})();