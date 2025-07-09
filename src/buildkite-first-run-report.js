// ==UserScript==
// @name         Buildkite First Run Report Links
// @namespace    http://tampermonkey.net/
// @version      0.1
// @description  Add "first run report" links to Buildkite test analytics pages
// @match        https://buildkite.com/organizations/rippling/analytics/suites/rippling-webapp-3/tests/*
// @grant        none
// ==/UserScript==

(function() {
  'use strict';

  // Utility functions
  function debug(msg, ...params) {
    console.log(`[Buildkite First Run Report] ${msg}`, ...params);
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

  function extractBuildNumber(element) {
    // Look for build number in the format "Build #123456"
    const buildLink = element.querySelector('a[href*="/builds/"]');
    if (buildLink) {
      const match = buildLink.textContent.match(/Build #(\d+)/);
      if (match) {
        return match[1];
      }
    }
    return null;
  }

  function extractTestName() {
    // Look for the test name in the h1 element
    const h1Element = document.querySelector('h1.text-lg.m-0.break-all.line-clamp-2');
    if (h1Element && h1Element.title) {
      const fullTitle = h1Element.title.trim();
      // Extract just the test name part after the file path
      // Format: "path/to/file.test.ts Test Name Here"
      const match = fullTitle.match(/\.test\.ts\s+(.+)$/);
      if (match) {
        return match[1].trim();
      }
    }
    return null;
  }

  function createFirstRunReportLink(buildNumber) {
    const link = document.createElement('a');
    const baseUrl = `https://ui-reports.ripplingciinternal.com/30days/playwright/frontend-ci_${buildNumber}/merged_html_report/index.html`;

    // Try to get the test name and add it as a filter
    const testName = extractTestName();
    let finalUrl = baseUrl;
    if (testName) {
      const encodedTestName = encodeURIComponent(testName);
      finalUrl = `${baseUrl}#?q=${encodedTestName}`;
      debug(`Adding test name filter: ${testName}`);
    }

    link.href = finalUrl;
    link.textContent = 'first run report';
    link.target = '_blank';
    link.rel = 'noopener noreferrer';
    link.style.cssText = `
      color: #3b82f6;
      text-decoration: none;
      font-size: 12px;
      margin-left: 8px;
      padding: 2px 6px;
      border: 1px solid #3b82f6;
      border-radius: 4px;
      background: rgba(59, 130, 246, 0.1);
      transition: all 0.2s ease;
    `;

    link.addEventListener('mouseenter', () => {
      link.style.background = '#3b82f6';
      link.style.color = 'white';
    });

    link.addEventListener('mouseleave', () => {
      link.style.background = 'rgba(59, 130, 246, 0.1)';
      link.style.color = '#3b82f6';
    });

    link.addEventListener('click', (e) => {
      debug(`Opening first run report for build ${buildNumber}${testName ? ` with test filter: ${testName}` : ''}`);
    });

    return link;
  }

  function addFirstRunReportLinks() {
    debug('Adding first run report links...');

    // Find all build number elements
    const buildElements = document.querySelectorAll('[data-testid="build-number"]');
    debug(`Found ${buildElements.length} build elements`);

    let linksAdded = 0;
    buildElements.forEach((element, index) => {
      // Check if we already added a link to this element
      if (element.querySelector('.first-run-report-link')) {
        return;
      }

      const buildNumber = extractBuildNumber(element);
      if (buildNumber) {
        debug(`Adding first run report link for build ${buildNumber}`);

        const link = createFirstRunReportLink(buildNumber);
        link.classList.add('first-run-report-link');

        // Add the link after the build number link
        element.appendChild(link);
        linksAdded++;
      } else {
        debug(`Could not extract build number from element ${index}`, element);
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
          // Check if any added nodes contain build elements
          mutation.addedNodes.forEach((node) => {
            if (node.nodeType === Node.ELEMENT_NODE) {
              if (node.querySelector && node.querySelector('[data-testid="build-number"]')) {
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
    debug('Initializing Buildkite First Run Report script');

    // Add links immediately if page is already loaded
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', addFirstRunReportLinks);
    } else {
      addFirstRunReportLinks();
    }

    // Also add links after a short delay to catch dynamic content
    setTimeout(addFirstRunReportLinks, 1000);

    // Observe for page changes (pagination, filtering, etc.)
    observePageChanges();
  }

  // Start the script
  initialize();
})();