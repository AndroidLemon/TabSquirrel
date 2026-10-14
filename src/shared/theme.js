/**
 * Theme choice (System / Light / Dark), shared by the notebook and the options page.
 *
 * chrome.storage.local ('theme') is the source of truth and reaches every page through
 * storage.onChanged. A localStorage copy lets theme-boot.js set <html data-theme> before first
 * paint, which async storage cannot. System is the default and is stored as the absence of an
 * attribute: the stylesheets follow prefers-color-scheme then.
 *
 * Importable in Node for unit tests: DOM and chrome access happens only inside the functions.
 */

export const THEME_KEY = 'theme';
export const THEMES = ['system', 'light', 'dark'];
export const THEME_LABELS = { system: 'System', light: 'Light', dark: 'Dark' };

export const normalizeTheme = (value) => (THEMES.includes(value) ? value : 'system');

/** System → Light → Dark → System. */
export const nextTheme = (theme) => THEMES[(THEMES.indexOf(normalizeTheme(theme)) + 1) % THEMES.length];

/** Put a choice on <html> and in the localStorage mirror. Does not touch chrome.storage. */
export function applyTheme(theme) {
  const choice = normalizeTheme(theme);
  const root = document.documentElement;
  if (choice === 'system') delete root.dataset.theme;
  else root.dataset.theme = choice;
  try {
    if (choice === 'system') localStorage.removeItem(THEME_KEY);
    else localStorage.setItem(THEME_KEY, choice);
  } catch {}
  return choice;
}

export async function loadTheme() {
  try {
    return normalizeTheme((await chrome.storage.local.get(THEME_KEY))[THEME_KEY]);
  } catch (err) {
    console.debug('Failed to load theme:', err);
    return 'system';
  }
}

/** Apply a choice here and store it, which tells every other open page through onChanged. */
export async function setTheme(theme) {
  const choice = applyTheme(theme);
  pendingTheme = choice;
  pendingWrites++;
  try {
    await chrome.storage.local.set({ [THEME_KEY]: choice });
  } catch (err) {
    console.debug('Failed to save theme:', err);
  } finally {
    if (--pendingWrites === 0) pendingTheme = null;
  }
  return choice;
}

// The latest choice made on this page while its write is in flight. onChanged also reports this page's own
// earlier writes, which arrive late in a fast run of clicks; applying them would flicker or end on the wrong mode.
let pendingTheme = null;
let pendingWrites = 0;

/** Apply the stored choice, then follow changes made on any other page. `onChange(choice)` runs after each apply. */
export async function startTheme(onChange = () => {}) {
  onChange(applyTheme(await loadTheme()));
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== 'local' || !changes[THEME_KEY]) return;
    const incoming = normalizeTheme(changes[THEME_KEY].newValue);
    if (pendingTheme !== null && incoming !== pendingTheme) return;
    onChange(applyTheme(incoming));
  });
}
