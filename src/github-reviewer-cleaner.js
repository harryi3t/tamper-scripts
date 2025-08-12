// ==UserScript==
// @name         GitHub Reviewer Cleaner
// @namespace    http://tampermonkey.net/
// @version      0.1
// @description  Add a button to clear unnecessary reviewers from GitHub PR reviewer modal
// @match        https://github.com/*/pull/*
// @grant        none
// ==/UserScript==

(function() {
  'use strict';

  // Utility functions
  function debug(msg, ...params) {
    console.log(`[GitHub Reviewer Cleaner] ${msg}`, ...params);
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
        z-index: 10001;
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

  function analyzeReviewers() {
    const modal = document.querySelector('.js-discussion-sidebar-menu');
    if (!modal) {
      return { unnecessary: 0, required: 0, total: 0 };
    }

    const reviewerItems = modal.querySelectorAll('.select-menu-item[role="menuitemcheckbox"]');
    let unnecessary = 0;
    let required = 0;
    let total = 0;

    reviewerItems.forEach((item) => {
      const isChecked = item.getAttribute('aria-checked') === 'true';
      const isDisabled = item.getAttribute('aria-disabled') === 'true';

      if (isChecked) {
        total++;
        if (isDisabled) {
          required++;
        } else {
          unnecessary++;
        }
      }
    });

    debug(`Reviewer analysis: ${unnecessary} unnecessary, ${required} required, ${total} total selected`);
    return { unnecessary, required, total };
  }

  function createClearButton() {
    const analysis = analyzeReviewers();
    const hasUnnecessary = analysis.unnecessary > 0;

    // Only show button if there are unnecessary reviewers to clear
    if (!hasUnnecessary) {
      debug('No unnecessary reviewers, not showing button');
      return null;
    }

    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'clear-reviewers-btn';
    button.textContent = `Clear ${analysis.unnecessary} Unnecessary Reviewer${analysis.unnecessary === 1 ? '' : 's'}`;
    button.style.cssText = `
      background: #ef4444;
      color: white;
      border: none;
      border-radius: 6px;
      padding: 8px 12px;
      font-size: 12px;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      cursor: pointer;
      margin: 8px;
      transition: background-color 0.2s ease;
      display: flex;
      align-items: center;
      gap: 4px;
    `;

    button.addEventListener('mouseenter', () => {
      button.style.background = '#dc2626';
    });

    button.addEventListener('mouseleave', () => {
      button.style.background = '#ef4444';
    });

    button.addEventListener('click', clearUnnecessaryReviewers);

    return button;
  }

  function createLoader() {
    const loader = document.createElement('div');
    loader.className = 'reviewer-cleaner-loader';
    loader.style.cssText = `
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 20px;
      color: #6b7280;
      font-size: 14px;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
    `;

    loader.innerHTML = `
      <svg width="16" height="16" viewBox="0 0 16 16" fill="none" style="margin-right: 8px; animation: spin 1s linear infinite;">
        <circle cx="8" cy="8" r="7" stroke="currentColor" stroke-opacity="0.25" stroke-width="2" fill="none"></circle>
        <path d="M15 8a7.002 7.002 0 00-7-7" stroke="currentColor" stroke-width="2" stroke-linecap="round"></path>
      </svg>
      Analyzing reviewers...
    `;

    // Add CSS animation for spinner
    if (!document.querySelector('#reviewer-cleaner-styles')) {
      const style = document.createElement('style');
      style.id = 'reviewer-cleaner-styles';
      style.textContent = `
        @keyframes spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
      `;
      document.head.appendChild(style);
    }

    return loader;
  }

    function clearUnnecessaryReviewers(event) {
    // Check if button is disabled
    if (event.target.disabled) {
      debug('Button is disabled, no action taken');
      return;
    }

    debug('Clearing unnecessary reviewers...');

    const modal = document.querySelector('.js-discussion-sidebar-menu');
    if (!modal) {
      Toast.error('Reviewer modal not found');
      return;
    }

    // Re-analyze to get current state
    const analysis = analyzeReviewers();

    if (analysis.unnecessary === 0) {
      if (analysis.total > 0) {
        Toast.info(`All ${analysis.total} selected reviewer${analysis.total === 1 ? ' is' : 's are'} required`);
      } else {
        Toast.info('No reviewers selected');
      }
      return;
    }

    // Find all reviewer items
    const reviewerItems = modal.querySelectorAll('.select-menu-item[role="menuitemcheckbox"]');
    debug(`Found ${reviewerItems.length} reviewer items`);

    let cleared = 0;
    let skipped = 0;

    reviewerItems.forEach((item) => {
      const isChecked = item.getAttribute('aria-checked') === 'true';
      const isDisabled = item.getAttribute('aria-disabled') === 'true';
      const checkbox = item.querySelector('input[type="checkbox"]');
      const username = item.querySelector('.js-username')?.textContent || 'Unknown';

      debug(`Reviewer: ${username}, Checked: ${isChecked}, Disabled: ${isDisabled}`);

      // Only uncheck reviewers that are:
      // 1. Currently checked (selected)
      // 2. NOT disabled (not needed/required)
      if (isChecked && !isDisabled && checkbox) {
        debug(`Clearing reviewer: ${username}`);

        // Uncheck the checkbox
        checkbox.checked = false;

        // Update the aria-checked attribute
        item.setAttribute('aria-checked', 'false');

        // Trigger change event to notify GitHub's JS
        const changeEvent = new Event('change', { bubbles: true });
        checkbox.dispatchEvent(changeEvent);

        // Also trigger click event for good measure
        const clickEvent = new Event('click', { bubbles: true });
        checkbox.dispatchEvent(clickEvent);

        cleared++;
      } else if (isDisabled) {
        debug(`Skipping disabled reviewer: ${username}`);
        skipped++;
      } else if (!isChecked) {
        debug(`Skipping unchecked reviewer: ${username}`);
      }
    });

    if (cleared > 0) {
      Toast.success(`Cleared ${cleared} unnecessary reviewer${cleared === 1 ? '' : 's'}${skipped > 0 ? `, kept ${skipped} required reviewer${skipped === 1 ? '' : 's'}` : ''}`);

      // Update button after clearing
      setTimeout(() => {
        const existingButton = document.querySelector('.clear-reviewers-btn');
        if (existingButton) {
          const newButton = createClearButton();
          if (newButton) {
            existingButton.parentNode.replaceChild(newButton, existingButton);
          } else {
            // Remove button if no longer needed
            existingButton.remove();
            debug('Removed button - no reviewers remaining');
          }
        }
      }, 100);
    } else {
      Toast.info('No unnecessary reviewers to clear');
    }

    debug(`Cleared: ${cleared}, Skipped: ${skipped}`);
  }

  function addClearButtonToModal() {
    const modal = document.querySelector('.js-discussion-sidebar-menu');
    if (!modal) {
      return;
    }

    // Check if button already exists
    if (modal.querySelector('.clear-reviewers-btn')) {
      return;
    }

    const header = modal.querySelector('.select-menu-header');
    if (!header) {
      debug('Could not find modal header');
      return;
    }

    // Show loader initially
    const loader = createLoader();
    header.appendChild(loader);

        // Simulate loading time to analyze reviewers
    setTimeout(() => {
      loader.remove();

      // Add the clear button (if needed)
      const button = createClearButton();
      if (button) {
        header.appendChild(button);
        debug('Added clear button to reviewer modal');
      } else {
        debug('No button needed - no reviewers selected');
      }
    }, 500);
  }

  function observeModalChanges() {
    debug('Observing modal changes');
    // MutationObserver to detect when modal DOM is added
    const mutationObserver = new MutationObserver((mutations) => {
      mutations.forEach((mutation) => {
        if (mutation.type === 'childList' && mutation.addedNodes.length > 0) {
          mutation.addedNodes.forEach((node) => {
            if (node.nodeType === Node.ELEMENT_NODE) {
              // Check if the reviewer modal was added
              if (node.classList?.contains('js-discussion-sidebar-menu') ||
                  node.querySelector?.('.js-discussion-sidebar-menu')) {
                debug('Reviewer modal DOM detected');
                setupModalVisibilityObserver();
              }
            }
          });
        }
      });
    });

    mutationObserver.observe(document.body, {
      childList: true,
      subtree: true
    });

    return mutationObserver;
  }

  function setupModalVisibilityObserver() {
    const modal = document.querySelector('.js-discussion-sidebar-menu');
    if (!modal) {
      debug('Modal not found for visibility observer');
      return;
    }

    // Check if we already set up observer for this modal
    if (modal.hasAttribute('data-reviewer-cleaner-observed')) {
      return;
    }
    modal.setAttribute('data-reviewer-cleaner-observed', 'true');

    debug('Setting up intersection observer for modal visibility');

    // IntersectionObserver to detect when modal becomes visible
    const intersectionObserver = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting && entry.target === modal) {
          debug('Reviewer modal is now visible, adding clear button');
          // Small delay to ensure modal content is fully loaded
          setTimeout(addClearButtonToModal, 200);
        }
      });
    }, {
      threshold: 0.1 // Trigger when at least 10% of modal is visible
    });

    intersectionObserver.observe(modal);

    // Also observe for style changes that might indicate visibility
    const styleObserver = new MutationObserver((mutations) => {
      mutations.forEach((mutation) => {
        if (mutation.type === 'attributes' && mutation.attributeName === 'style') {
          const style = modal.getAttribute('style') || '';
          // Check if modal is visible (not display: none, not visibility: hidden)
          if (!style.includes('display: none') && !style.includes('visibility: hidden')) {
            debug('Modal style indicates visibility, adding clear button');
            setTimeout(addClearButtonToModal, 100);
          }
        }
      });
    });

    styleObserver.observe(modal, {
      attributes: true,
      attributeFilter: ['style', 'class']
    });
  }

  function observeReviewerCogClicks() {
    // Look for the reviewer cog button and observe clicks
    const observeClicks = () => {
      // Find the reviewers section cog button
      const cogButtons = document.querySelectorAll('button[data-toggle-for="reviewers-select-menu"]');

      cogButtons.forEach(button => {
        if (button.hasAttribute('data-reviewer-cleaner-click-observed')) {
          return;
        }
        button.setAttribute('data-reviewer-cleaner-click-observed', 'true');

        debug('Found reviewer cog button, adding click listener');

        button.addEventListener('click', () => {
          debug('Reviewer cog clicked, waiting for modal to appear');
          // Wait a bit for the modal to be created and shown
          setTimeout(() => {
            setupModalVisibilityObserver();
            addClearButtonToModal();
          }, 300);
        });
      });
    };

    // Initial check
    observeClicks();

    // Also observe for new cog buttons being added
    const observer = new MutationObserver(() => {
      observeClicks();
    });

    observer.observe(document.body, {
      childList: true,
      subtree: true
    });
  }

  function initialize() {
    debug('Initializing GitHub Reviewer Cleaner script');
    debug('Current URL:', window.location.href);
    debug('Looking for existing modals and cog buttons...');

    // Check if modal is already present
    setTimeout(() => {
      const existingModal = document.querySelector('.js-discussion-sidebar-menu');
      debug('Existing modal found:', !!existingModal);
      addClearButtonToModal();
    }, 1000);

    // Observe for modal DOM changes
    observeModalChanges();

    // Observe for reviewer cog clicks
    observeReviewerCogClicks();

    // Also setup visibility observer for any existing modals
    setTimeout(() => {
      debug('Setting up visibility observer for any existing modals');
      setupModalVisibilityObserver();
    }, 2000);

    // Log current page elements for debugging
    setTimeout(() => {
      const cogButtons = document.querySelectorAll('button[data-toggle-for="reviewers-select-menu"]');
      const modals = document.querySelectorAll('.js-discussion-sidebar-menu');
      debug(`Found ${cogButtons.length} cog buttons and ${modals.length} modals on page`);
    }, 3000);
  }

  // Start the script
  initialize();
})();
