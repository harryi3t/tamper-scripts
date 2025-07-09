// ==UserScript==
// @name         Sentry Copy On-Call Info
// @namespace    http://tampermonkey.net/
// @version      0.1
// @description  Add a button to copy on-call info from Sentry issue pages
// @match        https://people-center-inc.sentry.io/issues/*
// @grant        none
// ==/UserScript==

(function () {
  // Generic code
  const enableDebugMode = true;
  const colors = {
    yellow: "#e39d02",
    plum: "#512f3e",
  };
  function debug(msg, ...params) {
    enableDebugMode && console.log(`tamperMonkey: ${msg}`, ...params);
  }

  const Toast = {
    show(message, type, delay = 3000) {
      const toast = document.createElement("div");
      toast.textContent = message;
      toast.style.position = "fixed";
      toast.style.bottom = "20px";
      toast.style.right = "20px";
      toast.style.padding = "10px 20px";
      toast.style.borderRadius = "5px";
      toast.style.color = "#fff";
      toast.style.zIndex = "10000";
      toast.style.transition = "opacity 0.5s ease-in-out";

      switch (type) {
        case "success":
          toast.style.backgroundColor = "#4CAF50";
          break;
        case "error":
          toast.style.backgroundColor = "#F44336";
          break;
        default:
          toast.style.backgroundColor = "#2196F3";
      }

      document.body.appendChild(toast);

      setTimeout(() => {
        toast.style.opacity = "0";
        setTimeout(() => {
          document.body.removeChild(toast);
        }, 500);
      }, delay);
    },
    info(message, delay = 3000) {
      this.show(message, "info");
    },
    success(message, delay = 3000) {
      this.show(message, "success");
    },
    error(message, delay = 3000) {
      this.show(message, "error");
    },
  };

  function createOrUpdateGenericButton({ label, id, color, onClick, styles }) {
    let button = document.getElementById(id);
    debug("existing button", button);

    if (!button) {
      button = document.createElement("button");
      button.id = id;
      debug("creating new button", button);
    }

    button.textContent = label;
    Object.assign(button.style, {
      backgroundColor: color ?? colors.yellow,
      padding: "8px 12px",
      minHeight: "32px",
      transition: "background 0.1s, border 0.1s, box-shadow 0.1s",
      borderRadius: "6px",
      ...styles,
    });
    button.addEventListener("click", onClick);
    return button;
  }

  // Code for the single copy button

  function addSingleCopyButton() {
    debug("calling addSingleCopyButton");
    const copyButtonId = "singleCopyButton";

    const header = document.querySelector(
      'header[data-sentry-element="Header"]',
    );
    if (!header) {
      debug("header not found, bailing out");
      return;
    }

    const resolveButton = document.querySelector(
      'button[aria-label="Resolve"]',
    );
    if (!resolveButton) {
      debug("resolveButton not found, bailing out");
      return;
    }

    let copyButton = createOrUpdateGenericButton({
      label: "Copy on-call info",
      id: copyButtonId,
      onClick: copySingleOnCallInfo,
    });
    copyButton.style.marginRight = "5px";
    copyButton.className = resolveButton.className;
    resolveButton.parentNode.insertBefore(copyButton, resolveButton);
  }

  function copySingleOnCallInfo() {
    const headerGrid = document.querySelector(
      '[data-sentry-element="HeaderGrid"]',
    );
    const titleElement = headerGrid.querySelector("div>span");
    const subTextElement = headerGrid.querySelector(
      "[data-sentry-component='EventMessage'] > div",
    );
    const headerSpans = [
      ...document.querySelectorAll(
        'header > [data-sentry-element="HeaderGrid"] > span',
      ),
    ];
    const eventsElement = headerSpans.at(-2);
    const usersElement = headerSpans.at(-1);

    debug("elements", {
      headerSpans,
      eventsElement,
      usersElement,
      subTextElement,
    });
    const url = window.location.href.split("?")[0]; // Remove query parameters

    if (!titleElement || !eventsElement || !usersElement) {
      alert("Unable to find required information");
      return;
    }

    const title = titleElement.textContent
      .replace(/^\[spend_management\]\s*/, "")
      .trim();
    const subText = subTextElement ? subTextElement.textContent.trim() : "";
    const events = eventsElement.textContent.trim();
    const users = usersElement.textContent.trim();

    const info = `Title: ${title} | ${subText}

Events: ${events}
Users: ${users}
Relevant links:
  ${url}`;

    navigator.clipboard
      .writeText(info)
      .then(() => {
        Toast.success("On-call info copied to clipboard!");
      })
      .catch((err) => {
        Toast.error("Failed to copy text: ", err);
      });
  }

  // Code for the bulk copy button

  function addBulkCopyButton() {
    debug("calling addBulkCopyButton");
    const copyButtonId = "bulkCopyButton";

    // Find the filters container to insert the button
    const filtersContainer = document.querySelector(
      '[data-sentry-element="FiltersContainer"]',
    );
    if (!filtersContainer) {
      debug("filtersContainer not found, bailing out");
      return;
    }

    let copyButton = createOrUpdateGenericButton({
      label: "Copy on-call info",
      id: copyButtonId,
      styles: { padding: "8px 12px", marginLeft: "8px", width: "200px" },
      onClick: copyOnCallInfoFromList,
    });
    // Append the button to the filters container
    filtersContainer.appendChild(copyButton);
    debug("added bulk button", copyButton);
  }

  function copyOnCallInfoFromList() {
    const objects = [];
    const baseUrl = window.location.origin;
    const rows = document.querySelectorAll('[data-test-id="group"]');
    const maxTitleToNeedCaption = 25;

    rows.forEach((row) => {
      const titleElement = row.querySelector(
        '[data-testid="stacktrace-preview"]',
      );
      const captionElement = row.querySelector(
        '[data-sentry-component="EventMessage"] > div',
      );

      let title = titleElement ? titleElement.innerText.trim() : "";
      let caption = captionElement ? captionElement.innerText.trim() : "";

      const prefix = "[spend_management] ";
      if (title.startsWith(prefix)) {
        title = title.replace(prefix, "");
      }

      if (caption.startsWith(prefix)) {
        caption = caption.replace(prefix, "");
      }

      if (title.length < maxTitleToNeedCaption) {
        title = `${title} | ${caption}`;
      }

      // Extract events and users counts from the counts wrappers
      const countsWrappers = row.querySelectorAll(
        '[data-sentry-element="CountsWrapper"]',
      );
      let events = "";
      let users = "";
      if (countsWrappers.length >= 2) {
        const eventSpans = countsWrappers[0].querySelectorAll("span");
        events = eventSpans[0]?.innerText.trim() || "";
        const userSpans = countsWrappers[1].querySelectorAll("span");
        users = userSpans[0]?.innerText.trim() || "";
      }

      debug("elements", { row, events, users });

      const linkElement = row.querySelector('[data-issue-title-link="true"]');
      let link = "";
      if (linkElement) {
        const href = linkElement.getAttribute("href");
        const urlParts = href.split("?")[0];
        link = `${baseUrl}${urlParts}`;
      }

      const obj = {
        title: title,
        events: events,
        users: users,
        link: link,
      };
      objects.push(obj);
    });

    const formattedStrings = objects.map((obj) => {
      return `Title: ${obj.title}\nEvents: ${obj.events}\nUsers: ${obj.users}\nRelevant links:\n  ${obj.link}`;
    });

    const withQuotes = '"' + formattedStrings.join('"\n"') + '"';
    console.log(withQuotes);
    navigator.clipboard
      .writeText(withQuotes)
      .then(() => {
        Toast.success("On-call info copied to clipboard!");
      })
      .catch((err) => {
        Toast.error("Failed to copy text: ", err);
      });
  }

  // Common code

  function initialize() {
    debug("Initializing copy-on-call buttons");
    // Detail page if issue header is present
    const detailHeader = document.querySelector('header[data-sentry-element="Header"]');
    if (detailHeader) {
      debug("Detected details page (header present)");
      addSingleCopyButton();
      return;
    }
    // Listing page if group rows exist
    const groupRows = document.querySelectorAll('[data-test-id="group"]');
    if (groupRows.length > 0) {
      debug("Detected listing page (group rows present)");
      addBulkCopyButton();
      return;
    }
    debug("Page type not recognized, no buttons added");
  }

  function waitForUIAndInitialize() {
    debug("Observing UI for copy buttons");
    const observer = new MutationObserver((mutations, obs) => {
      // Wait until loading indicator disappears
      const loadingIndicator = document.querySelector('[data-test-id="loading-indicator"]');
      if (loadingIndicator) {
        debug("Page loading, waiting for loading indicator to vanish");
        return;
      }
      // Detail page: header element
      const detailHeader = document.querySelector('header[data-sentry-element="Header"]');
      if (detailHeader) {
        debug("Header found, initializing detail page button");
        addSingleCopyButton();
        obs.disconnect();
        return;
      }
      // Listing page: filters container
      const filtersContainer = document.querySelector('[data-sentry-element="FiltersContainer"]');
      if (filtersContainer) {
        debug("Filters container found, initializing listing page button");
        addBulkCopyButton();
        obs.disconnect();
        return;
      }
    });
    observer.observe(document.body, { childList: true, subtree: true });
  }

  const titleObserver = new MutationObserver((mutations) => {
    for (const mutation of mutations) {
      if (
        mutation.type === "childList" &&
        mutation.target.nodeName === "TITLE"
      ) {
        debug("TITLE changed, initializing", mutation.target);
        waitForUIAndInitialize();
        break;
      }
    }
  });

  debug("attaching mutation observer on title");
  titleObserver.observe(document.querySelector("head > title"), {
    childList: true,
  });
})();
