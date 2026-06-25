// Mobile Navigation + Desktop Touch Dropdowns + Sticky Header

// 1. Sticky Header Shadow
const header = document.querySelector('.site-header');
if (header) {
  const onScroll = () => header.classList.toggle('scrolled', window.scrollY > 10);
  window.addEventListener('scroll', onScroll, { passive: true });
  onScroll();
}

// 2. Mobile Nav Toggle
const hamburger = document.querySelector('.nav-hamburger');
const mobileNav = document.querySelector('.mobile-nav');

if (hamburger) {
  const setNavOpen = (open: boolean) => {
    document.body.classList.toggle('nav-open', open);
    hamburger.setAttribute('aria-expanded', open ? 'true' : 'false');
  };

  hamburger.addEventListener('click', (e) => {
    e.stopPropagation();
    setNavOpen(!document.body.classList.contains('nav-open'));
  });

  document.addEventListener('click', (e) => {
    if (!document.body.classList.contains('nav-open')) return;
    const target = e.target as HTMLElement;
    if (mobileNav?.contains(target)) return;
    if (hamburger.contains(target)) return;
    setNavOpen(false);
  });

  if (mobileNav) {
    mobileNav.addEventListener('click', (e) => {
      const target = e.target as HTMLElement;
      if (target.closest('a')) {
        setNavOpen(false);
      }
    });
  }
}

// 3. Mobile Accordion
document.querySelectorAll('.mobile-nav-link').forEach((link) => {
  const parent = link.closest('.mobile-nav-item');
  if (!parent) return;
  const subnav = parent.querySelector('.mobile-subnav');
  if (!subnav) return;

  link.addEventListener('click', (e) => {
    e.preventDefault();
    document.querySelectorAll('.mobile-nav-item.open').forEach((item) => {
      if (item !== parent) {
        item.classList.remove('open');
        const sibling = item.querySelector('.mobile-nav-link');
        if (sibling) sibling.setAttribute('aria-expanded', 'false');
      }
    });
    const willOpen = !parent.classList.contains('open');
    parent.classList.toggle('open', willOpen);
    link.setAttribute('aria-expanded', willOpen ? 'true' : 'false');
  });
});

// 4. Desktop Dropdown — touch + keyboard support
const navItems = document.querySelectorAll('.nav-item');

const setItemOpen = (item: Element, open: boolean) => {
  item.classList.toggle('open', open);
  if (open) item.classList.remove('nav-dropdown-collapsed');
  const trigger = item.querySelector('.nav-link');
  if (trigger) trigger.setAttribute('aria-expanded', open ? 'true' : 'false');
};

navItems.forEach((item) => {
  const dropdown = item.querySelector('.nav-dropdown');
  if (!dropdown) return;
  const link = item.querySelector('.nav-link') as HTMLElement | null;
  if (!link) return;

  // Click: on touch (no hover) it toggles. On hover devices the CSS :hover
  // already opens it, so a real mouse click is ignored — but a keyboard
  // activation (Enter/Space fires a click with detail === 0) always toggles.
  link.addEventListener('click', (e) => {
    const keyboard = (e as MouseEvent).detail === 0;
    if (window.matchMedia('(hover: hover)').matches && !keyboard) return;
    e.preventDefault();
    const willOpen = !item.classList.contains('open');
    navItems.forEach((other) => { if (other !== item) setItemOpen(other, false); });
    setItemOpen(item, willOpen);
  });

  // Keep aria-expanded honest with the CSS :focus-within reveal, and clear any
  // prior Escape-collapse as soon as focus (re)enters the item.
  item.addEventListener('focusin', () => {
    item.classList.remove('nav-dropdown-collapsed');
    link.setAttribute('aria-expanded', 'true');
  });
  item.addEventListener('focusout', (e) => {
    if (!item.contains((e as FocusEvent).relatedTarget as Node)) {
      item.classList.remove('open', 'nav-dropdown-collapsed');
      link.setAttribute('aria-expanded', 'false');
    }
  });

  // Escape closes the dropdown and returns focus to the trigger.
  item.addEventListener('keydown', (e) => {
    if ((e as KeyboardEvent).key !== 'Escape') return;
    link.focus(); // move focus to the trigger first…
    // …then collapse, so the focusin handler above doesn't immediately re-open it.
    item.classList.remove('open');
    item.classList.add('nav-dropdown-collapsed');
    link.setAttribute('aria-expanded', 'false');
  });
});

document.addEventListener('click', (e) => {
  const target = e.target as HTMLElement;
  navItems.forEach((item) => {
    if (!item.contains(target)) setItemOpen(item, false);
  });
});

// 5. Dropdown Group Accordion (Women/Men/Youth)
document.querySelectorAll('.dropdown-group-toggle').forEach((toggle) => {
  toggle.addEventListener('click', (e) => {
    e.preventDefault();
    e.stopPropagation();
    const expanded = toggle.getAttribute('aria-expanded') === 'true';
    // Close siblings in same dropdown
    const parent = toggle.closest('.nav-dropdown, .mobile-subnav');
    if (parent) {
      parent.querySelectorAll('.dropdown-group-toggle').forEach((other) => {
        if (other !== toggle) other.setAttribute('aria-expanded', 'false');
      });
    }
    toggle.setAttribute('aria-expanded', expanded ? 'false' : 'true');
  });
});

// 6. Active Nav Highlighting
const currentPath = window.location.pathname.replace(/\/$/, '') || '/';
document.querySelectorAll('.nav-link, .dropdown-link, .mobile-nav-link, .mobile-sublink').forEach((link) => {
  const href = link.getAttribute('href');
  if (!href) return;
  const linkPath = href.split('#')[0].split('?')[0].replace(/\/$/, '') || '/';
  if (linkPath === currentPath) {
    link.classList.add('active');
    const parentItem = link.closest('.nav-item');
    if (parentItem) {
      const parentLink = parentItem.querySelector('.nav-link');
      if (parentLink) parentLink.classList.add('active');
    }
    // Auto-expand the accordion group containing the active link
    const group = link.closest('.dropdown-group-items');
    if (group) {
      const toggle = group.previousElementSibling;
      if (toggle?.classList.contains('dropdown-group-toggle')) {
        toggle.setAttribute('aria-expanded', 'true');
      }
    }
  }
});

// 7. Smooth Scroll for Anchor Links
document.addEventListener('click', (e) => {
  const link = (e.target as HTMLElement).closest('a[href*="#"]');
  if (!link) return;
  const href = link.getAttribute('href')!;
  const hashIndex = href.indexOf('#');
  if (hashIndex === -1) return;
  const path = href.substring(0, hashIndex);
  if (path && path !== '' && path !== window.location.pathname) return;
  const targetId = href.substring(hashIndex + 1);
  if (!targetId) return;
  const targetEl = document.getElementById(targetId);
  if (!targetEl) return;
  e.preventDefault();
  const headerEl = document.querySelector('.site-header');
  const headerHeight = headerEl ? headerEl.getBoundingClientRect().height : 0;
  const targetPosition = targetEl.getBoundingClientRect().top + window.scrollY - headerHeight - 16;
  window.scrollTo({ top: targetPosition, behavior: 'smooth' });
  history.pushState(null, '', '#' + targetId);
});
