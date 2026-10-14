/* Classic script, first in <head> on every page: sets data-theme from the localStorage mirror before
   first paint, so a chosen light or dark theme never flashes the other one. Extension CSP forbids
   inline scripts, so this lives in a file. No attribute means System. Keep the key in step with
   THEME_KEY in theme.js. */
try {
  const choice = localStorage.getItem('theme');
  if (choice === 'light' || choice === 'dark') document.documentElement.dataset.theme = choice;
} catch {}
