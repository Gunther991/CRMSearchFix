(function () {
  const DEFAULT_SETTINGS = {
    enabled: true,
    sites: [],
    searchSelector:
      'input[name="phone"], input[name="fio"], input[name="email"], input[name="created"], input[name="user_id"]',
    blockOnlyEmptyArea: true,
    blockBlurEvents: true,
    searchOnEnter: true,
    debug: false
  };

  let settings = { ...DEFAULT_SETTINGS };
  let activeSearchElement = null;
  let lastFocusedElement = null;
  let lastBlockedAt = 0;
  let allowLifecycleUntil = 0;

  const hasChromeStorage =
    typeof chrome !== "undefined" && chrome.storage && chrome.storage.sync;

  function normalizeHost(host) {
    return String(host || "").replace(/^www\./, "").toLowerCase();
  }

  function isConfiguredForCurrentSite() {
    const host = normalizeHost(window.location.hostname);

    return settings.sites.some((site) => {
      const value = normalizeHost(site);
      return value && (host === value || host.endsWith(`.${value}`));
    });
  }

  function loadSettings() {
    if (!hasChromeStorage) return;

    chrome.storage.sync.get(DEFAULT_SETTINGS, (stored) => {
      settings = {
        ...DEFAULT_SETTINGS,
        ...stored,
        sites: Array.isArray(stored.sites) ? stored.sites : []
      };
    });
  }

  function isSearchElement(element) {
    if (!element || element.nodeType !== Node.ELEMENT_NODE) return false;

    try {
      return element.matches(settings.searchSelector);
    } catch (_error) {
      return element.matches(DEFAULT_SETTINGS.searchSelector);
    }
  }

  function log(message, details) {
    if (!settings.debug) return;
    console.debug(`[CRM Search Fix] ${message}`, details || "");
  }

  function cssEscape(value) {
    if (window.CSS && CSS.escape) return CSS.escape(value);
    return String(value).replace(/["\\]/g, "\\$&");
  }

  function buildSelectorForElement(element) {
    if (!element || element.nodeType !== Node.ELEMENT_NODE) return "";

    const tagName = element.tagName.toLowerCase();
    if (element.id) return `${tagName}#${cssEscape(element.id)}`;

    const stableAttributes = ["name", "type", "placeholder", "aria-label", "data-testid"];
    for (const attribute of stableAttributes) {
      const value = element.getAttribute(attribute);
      if (value) return `${tagName}[${attribute}="${cssEscape(value)}"]`;
    }

    const className = Array.from(element.classList || []).slice(0, 2).map(cssEscape).join(".");
    return className ? `${tagName}.${className}` : tagName;
  }

  function findSearchElement(start) {
    if (!start || start.nodeType !== Node.ELEMENT_NODE) return null;

    try {
      return start.closest(settings.searchSelector);
    } catch (_error) {
      return start.closest(DEFAULT_SETTINGS.searchSelector);
    }
  }

  function isInteractiveElement(element) {
    if (!element || element.nodeType !== Node.ELEMENT_NODE) return false;

    return Boolean(
      element.closest(
        'a[href], button, input, textarea, select, option, label, summary, [role="button"], [role="link"], [role="menuitem"], [role="tab"], [contenteditable="true"]'
      )
    );
  }

  function isEmptyAreaClick(target) {
    if (!target || target === document || target === window) return true;
    if (target === document.documentElement || target === document.body) return true;
    if (isInteractiveElement(target)) return false;

    const style = window.getComputedStyle(target);
    const hasOwnVisualSurface =
      style.cursor === "pointer" ||
      style.backgroundImage !== "none" ||
      style.backgroundColor !== "rgba(0, 0, 0, 0)" ||
      style.borderTopStyle !== "none" ||
      style.borderRightStyle !== "none" ||
      style.borderBottomStyle !== "none" ||
      style.borderLeftStyle !== "none";

    return !hasOwnVisualSurface;
  }

  function shouldBlockEvent(event) {
    if (!settings.enabled || !isConfiguredForCurrentSite()) return false;
    if (!activeSearchElement || !document.contains(activeSearchElement)) return false;
    if (!isSearchElement(activeSearchElement)) return false;
    if (document.activeElement !== activeSearchElement) return false;
    if (findSearchElement(event.target)) return false;

    return settings.blockOnlyEmptyArea ? isEmptyAreaClick(event.target) : !isInteractiveElement(event.target);
  }

  function blockEvent(event) {
    if (!shouldBlockEvent(event)) return;

    lastBlockedAt = Date.now();
    event.preventDefault();
    event.stopImmediatePropagation();
    event.stopPropagation();
    log(`blocked ${event.type}`, {
      target: event.target,
      activeSearchElement
    });

    if (document.activeElement !== activeSearchElement) {
      activeSearchElement.focus({ preventScroll: true });
    }
  }

  function shouldBlockSearchFieldLifecycle(event) {
    if (!settings.enabled || !settings.blockBlurEvents || !isConfiguredForCurrentSite()) {
      return false;
    }

    if (Date.now() < allowLifecycleUntil) {
      log(`allowed field ${event.type}`, {
        target: event.target,
        selector: buildSelectorForElement(event.target)
      });
      return false;
    }

    return event.target === activeSearchElement && isSearchElement(event.target);
  }

  function blockSearchFieldLifecycle(event) {
    if (!shouldBlockSearchFieldLifecycle(event)) return;

    lastBlockedAt = Date.now();
    event.stopImmediatePropagation();
    event.stopPropagation();
    log(`blocked field ${event.type}`, {
      target: event.target,
      selector: buildSelectorForElement(event.target)
    });
  }

  function rememberFocus(event) {
    const element = event.target;
    lastFocusedElement = element;

    if (isSearchElement(element)) {
      activeSearchElement = element;
      log("remembered field", {
        target: element,
        selector: buildSelectorForElement(element)
      });
    } else {
      activeSearchElement = null;
    }
  }

  function triggerSearchOnEnter(event) {
    if (!settings.enabled || !settings.searchOnEnter || !isConfiguredForCurrentSite()) return;
    if (event.key !== "Enter" || event.isComposing) return;
    if (!isSearchElement(event.target)) return;

    allowLifecycleUntil = Date.now() + 700;
    activeSearchElement = event.target;

    log("enter search trigger", {
      target: event.target,
      selector: buildSelectorForElement(event.target)
    });

    event.target.dispatchEvent(new Event("change", { bubbles: true }));
    event.target.dispatchEvent(new FocusEvent("focusout", { bubbles: true, relatedTarget: null }));
    event.target.dispatchEvent(new FocusEvent("blur", { bubbles: false, relatedTarget: null }));
  }

  function keepKnownSearchAfterBlockedBlur(event) {
    if (event.target !== activeSearchElement) return;
    if (settings.blockBlurEvents && isSearchElement(event.target)) return;
    if (Date.now() - lastBlockedAt > 250) {
      activeSearchElement = null;
    }
  }

  loadSettings();

  if (hasChromeStorage && chrome.storage.onChanged) {
    chrome.storage.onChanged.addListener((changes, areaName) => {
      if (areaName !== "sync") return;
      for (const [key, change] of Object.entries(changes)) {
        settings[key] = change.newValue;
      }
    });
  }

  if (typeof chrome !== "undefined" && chrome.runtime && chrome.runtime.onMessage) {
    chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
      if (!message || message.type !== "GET_LAST_FOCUSED_FIELD") return false;

      const element = lastFocusedElement;
      sendResponse({
        selector: buildSelectorForElement(element),
        tagName: element && element.tagName ? element.tagName.toLowerCase() : "",
        type: element && element.getAttribute ? element.getAttribute("type") || "" : "",
        name: element && element.getAttribute ? element.getAttribute("name") || "" : "",
        placeholder: element && element.getAttribute ? element.getAttribute("placeholder") || "" : ""
      });
      return true;
    });
  }

  document.addEventListener("focusin", rememberFocus, true);
  document.addEventListener("keydown", triggerSearchOnEnter, true);
  document.addEventListener("blur", keepKnownSearchAfterBlockedBlur, true);

  for (const eventName of ["blur", "focusout", "change"]) {
    document.addEventListener(eventName, blockSearchFieldLifecycle, true);
  }

  for (const eventName of ["pointerdown", "mousedown", "mouseup", "click", "touchstart"]) {
    document.addEventListener(eventName, blockEvent, { capture: true, passive: false });
  }
})();
