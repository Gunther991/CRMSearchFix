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

const elements = {
  enabled: document.querySelector("#enabled"),
  currentHost: document.querySelector("#currentHost"),
  addCurrentSite: document.querySelector("#addCurrentSite"),
  removeCurrentSite: document.querySelector("#removeCurrentSite"),
  sites: document.querySelector("#sites"),
  searchSelector: document.querySelector("#searchSelector"),
  useLastFocusedField: document.querySelector("#useLastFocusedField"),
  blockOnlyEmptyArea: document.querySelector("#blockOnlyEmptyArea"),
  blockBlurEvents: document.querySelector("#blockBlurEvents"),
  searchOnEnter: document.querySelector("#searchOnEnter"),
  debug: document.querySelector("#debug"),
  status: document.querySelector("#status")
};

let currentHost = "";
let currentTabId = 0;
let statusTimer = 0;

function normalizeHost(host) {
  return String(host || "").replace(/^www\./, "").toLowerCase();
}

function parseSites(value) {
  return value
    .split(/\r?\n/)
    .map((site) => normalizeHost(site.trim()))
    .filter(Boolean);
}

function unique(values) {
  return [...new Set(values)];
}

function showStatus(text) {
  window.clearTimeout(statusTimer);
  elements.status.textContent = text;
  statusTimer = window.setTimeout(() => {
    elements.status.textContent = "";
  }, 1800);
}

function readFormSettings() {
  return {
    enabled: elements.enabled.checked,
    sites: unique(parseSites(elements.sites.value)),
    searchSelector: elements.searchSelector.value.trim() || DEFAULT_SETTINGS.searchSelector,
    blockOnlyEmptyArea: elements.blockOnlyEmptyArea.checked,
    blockBlurEvents: elements.blockBlurEvents.checked,
    searchOnEnter: elements.searchOnEnter.checked,
    debug: elements.debug.checked
  };
}

function render(settings) {
  elements.enabled.checked = settings.enabled;
  elements.sites.value = settings.sites.join("\n");
  elements.searchSelector.value = settings.searchSelector;
  elements.blockOnlyEmptyArea.checked = settings.blockOnlyEmptyArea;
  elements.blockBlurEvents.checked = settings.blockBlurEvents;
  elements.searchOnEnter.checked = settings.searchOnEnter;
  elements.debug.checked = settings.debug;
}

async function getCurrentTab() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  return tab || null;
}

function getHostFromTab(tab) {
  if (!tab || !tab.url) return "";

  try {
    const url = new URL(tab.url);
    return normalizeHost(url.hostname);
  } catch (_error) {
    return "";
  }
}

async function saveSettings() {
  const settings = readFormSettings();
  await chrome.storage.sync.set(settings);
  showStatus("Сохранено");
}

async function init() {
  const tab = await getCurrentTab();
  currentTabId = tab && tab.id ? tab.id : 0;
  currentHost = getHostFromTab(tab);
  elements.currentHost.textContent = currentHost || "Откройте обычную страницу сайта";

  const settings = await chrome.storage.sync.get(DEFAULT_SETTINGS);
  render({
    ...DEFAULT_SETTINGS,
    ...settings,
    sites: Array.isArray(settings.sites) ? settings.sites : []
  });
}

elements.enabled.addEventListener("change", saveSettings);
elements.sites.addEventListener("input", saveSettings);
elements.searchSelector.addEventListener("input", saveSettings);
elements.blockOnlyEmptyArea.addEventListener("change", saveSettings);
elements.blockBlurEvents.addEventListener("change", saveSettings);
elements.searchOnEnter.addEventListener("change", saveSettings);
elements.debug.addEventListener("change", saveSettings);

elements.addCurrentSite.addEventListener("click", async () => {
  if (!currentHost) return;
  const sites = unique([...parseSites(elements.sites.value), currentHost]);
  elements.sites.value = sites.join("\n");
  await saveSettings();
});

elements.removeCurrentSite.addEventListener("click", async () => {
  if (!currentHost) return;
  const sites = parseSites(elements.sites.value).filter((site) => site !== currentHost);
  elements.sites.value = sites.join("\n");
  await saveSettings();
});

elements.useLastFocusedField.addEventListener("click", async () => {
  if (!currentTabId) return;

  try {
    const response = await chrome.tabs.sendMessage(currentTabId, {
      type: "GET_LAST_FOCUSED_FIELD"
    });

    if (!response || !response.selector) {
      showStatus("Сначала кликните в поле телефона");
      return;
    }

    elements.searchSelector.value = response.selector;
    await saveSettings();
    showStatus(`Выбрано: ${response.selector}`);
  } catch (_error) {
    showStatus("Обновите страницу CRM и попробуйте снова");
  }
});

init();
