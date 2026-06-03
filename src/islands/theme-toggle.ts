// Theme Toggle (dark/light mode)

function initThemeToggle() {
  const toggles = document.querySelectorAll('.theme-toggle');

  toggles.forEach((btn) => {
    btn.addEventListener('click', () => {
      const isLight = document.documentElement.classList.toggle('light');
      localStorage.setItem('kscw-theme', isLight ? 'light' : 'dark');

      toggles.forEach((b) => {
        const icon = b.querySelector('[data-lucide]');
        const label = b.querySelector('.theme-label');
        const data = (b as HTMLElement).dataset;
        const lightLabel = data.labelLight || 'Light Mode';
        const darkLabel = data.labelDark || 'Dark Mode';
        if (icon) icon.setAttribute('data-lucide', isLight ? 'moon' : 'sun');
        // Label shows the action for the *next* toggle: in light mode offer dark, and vice versa
        if (label) label.textContent = isLight ? darkLabel : lightLabel;
        if (typeof (window as any).lucide !== 'undefined') {
          (window as any).lucide.createIcons();
        }
      });
    });
  });
}

initThemeToggle();
