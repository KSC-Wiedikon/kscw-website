// Theme Toggle (dark/light mode)
//
// The visible label shows the action for the *next* toggle (in light mode it
// offers dark, and vice versa). Because the label text is language-dependent
// AND theme-dependent, the i18n engine can't own it directly — instead we
// repaint it here on theme change, on language change, and once i18n is ready.

function labelsFor(btn: Element) {
  const i18n = (window as any).i18n;
  const data = (btn as HTMLElement).dataset;
  const lightLabel = (i18n?.t && i18n.t('themeLight')) || data.labelLight || 'Light Mode';
  const darkLabel = (i18n?.t && i18n.t('themeDark')) || data.labelDark || 'Dark Mode';
  return { lightLabel, darkLabel };
}

function paint(btn: Element, isLight: boolean) {
  const { lightLabel, darkLabel } = labelsFor(btn);
  const icon = btn.querySelector('[data-lucide]');
  const label = btn.querySelector('.theme-label');
  if (icon) icon.setAttribute('data-lucide', isLight ? 'moon' : 'sun');
  if (label) label.textContent = isLight ? darkLabel : lightLabel;
  // Keep the dataset attrs in sync with the active language so any other
  // reader (and the next click) sees localized values.
  (btn as HTMLElement).dataset.labelLight = lightLabel;
  (btn as HTMLElement).dataset.labelDark = darkLabel;
  if (typeof (window as any).lucide !== 'undefined') {
    (window as any).lucide.createIcons();
  }
}

function repaintAll() {
  const isLight = document.documentElement.classList.contains('light');
  document.querySelectorAll('.theme-toggle').forEach((b) => paint(b, isLight));
}

function initThemeToggle() {
  const toggles = document.querySelectorAll('.theme-toggle');

  toggles.forEach((btn) => {
    btn.addEventListener('click', () => {
      const isLight = document.documentElement.classList.toggle('light');
      localStorage.setItem('kscw-theme', isLight ? 'light' : 'dark');
      toggles.forEach((b) => paint(b, isLight));
    });
  });

  // Re-localize the label when the language changes or once i18n is ready
  // (the server-rendered label is German until then).
  document.addEventListener('langChanged', repaintAll);
  if ((window as any).i18nReady) {
    (window as any).i18nReady.then(repaintAll);
  }
}

initThemeToggle();
