// ==UserScript==
// @name         GitHub PR First Run Report Links
// @namespace    http://tampermonkey.net/
// @version      0.1
// @description  Add "first run report" links to Frontend-CI Report comments on GitHub PRs
// @match        https://github.com/Rippling/rippling-webapp/pull/*
// @grant        none
// ==/UserScript==

(function() {
  'use strict';

  // Utility functions
  function debug(msg, ...params) {
    console.log(`[GitHub PR First Run Report] ${msg}`, ...params);
  }

  const Toast = {
    show(message, type, delay = 3000) {
      const toast = document.createElement('div');
      toast.textContent = message;
      toast.style.cssText = `
        position: fixed;
        top: 20px;
        right: 20px;
        padding: 12px 20px;
        background: ${type === 'success' ? '#10b981' : type === 'error' ? '#ef4444' : '#3b82f6'};
        color: white;
        border-radius: 6px;
        z-index: 10000;
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
        font-size: 14px;
        box-shadow: 0 4px 12px rgba(0,0,0,0.15);
      `;
      document.body.appendChild(toast);
      setTimeout(() => toast.remove(), delay);
    },

    info(message, delay = 3000) {
      this.show(message, 'info', delay);
    },

    success(message, delay = 3000) {
      this.show(message, 'success', delay);
    },

    error(message, delay = 3000) {
      this.show(message, 'error', delay);
    }
  };

  function extractBuildNumber(commentElement) {
    // Look for the Build link that contains the build number
    const buildLink = commentElement.querySelector('a[href*="buildkite.com/rippling/frontend-ci/builds/"]');
    if (buildLink) {
      const match = buildLink.textContent.match(/#(\d+)/);
      if (match) {
        return match[1];
      }

      // Also try to extract from href if text doesn't work
      const hrefMatch = buildLink.href.match(/builds\/(\d+)/);
      if (hrefMatch) {
        return hrefMatch[1];
      }
    }
    return null;
  }

  function createFirstRunReportLink(buildNumber) {
    const link = document.createElement('a');
    link.href = `https://ui-reports.ripplingciinternal.com/30days/playwright/frontend-ci_${buildNumber}/merged_html_report/index.html`;
    link.textContent = 'link';
    link.target = '_blank';
    link.rel = 'noopener noreferrer';
    link.style.cssText = `
      color: #0969da;
      text-decoration: none;
    `;

    link.addEventListener('mouseenter', () => {
      link.style.textDecoration = 'underline';
    });

    link.addEventListener('mouseleave', () => {
      link.style.textDecoration = 'none';
    });

    link.addEventListener('click', (e) => {
      debug(`Opening first run report for build ${buildNumber}`);
    });

    return link;
  }

  function addFirstRunReportLinks() {
    debug('Adding first run report links to Frontend-CI Report comments...');

    // Find all comment bodies
    const commentBodies = document.querySelectorAll('.comment-body');

    let linksAdded = 0;
    commentBodies.forEach((commentBody, index) => {
      // Check if this comment has "Frontend-CI Report" title
      const h2Element = commentBody.querySelector('h2');
      if (!h2Element || !h2Element.textContent.includes('Frontend-CI Report')) {
        return;
      }

      // Check if we already added a link to this comment
      if (commentBody.querySelector('.first-run-report-link')) {
        return;
      }

      const buildNumber = extractBuildNumber(commentBody);
      if (buildNumber) {
        debug(`Adding first run report link for build ${buildNumber}`);

        // Find the Build line (h4 containing "Build:")
        const buildH4 = Array.from(commentBody.querySelectorAll('h4')).find(h4 =>
          h4.textContent.includes('Build:')
        );

        if (buildH4) {
          // Create a new h4 element for the first run report
          const firstRunH4 = document.createElement('h4');
          firstRunH4.setAttribute('dir', 'auto');
          firstRunH4.textContent = 'First run report: ';

          const link = createFirstRunReportLink(buildNumber);
          link.classList.add('first-run-report-link');

          firstRunH4.appendChild(link);

          // Insert after the Build h4
          buildH4.parentNode.insertBefore(firstRunH4, buildH4.nextSibling);
          linksAdded++;
        } else {
          debug(`Could not find Build h4 element in comment ${index}`);
        }
      } else {
        debug(`Could not extract build number from comment ${index}`, commentBody);
      }
    });

    if (linksAdded > 0) {
      debug(`Successfully added ${linksAdded} first run report links`);
    }
  }

  function observePageChanges() {
    const observer = new MutationObserver((mutations) => {
      let shouldAddLinks = false;

      mutations.forEach((mutation) => {
        if (mutation.type === 'childList' && mutation.addedNodes.length > 0) {
          // Check if any added nodes contain comment bodies
          mutation.addedNodes.forEach((node) => {
            if (node.nodeType === Node.ELEMENT_NODE) {
              if (node.querySelector && node.querySelector('.comment-body')) {
                shouldAddLinks = true;
              }
            }
          });
        }
      });

      if (shouldAddLinks) {
        debug('Page content changed, re-adding first run report links');
        setTimeout(addFirstRunReportLinks, 100);
      }
    });

    observer.observe(document.body, {
      childList: true,
      subtree: true
    });

    return observer;
  }

  function initialize() {
    debug('Initializing GitHub PR First Run Report script');

    // Add links immediately if page is already loaded
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', addFirstRunReportLinks);
    } else {
      addFirstRunReportLinks();
    }

    // Also add links after a short delay to catch dynamic content
    setTimeout(addFirstRunReportLinks, 1000);

    // Observe for page changes (new comments, etc.)
    observePageChanges();
  }

  // Start the script
  initialize();
})();