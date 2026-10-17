(() => {
  const media = matchMedia('(prefers-color-scheme: dark)');
  let preference = 'system';
  try { preference = localStorage.getItem('mb-theme') || 'system'; } catch {}
  function apply(value) {
    preference = ['light', 'dark', 'system'].includes(value) ? value : 'system';
    const dark = preference === 'dark' || (preference === 'system' && media.matches);
    document.documentElement.dataset.theme = dark ? 'dark' : 'light';
    document.documentElement.style.colorScheme = dark ? 'dark' : 'light';
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content', dark ? '#17221f' : '#faf9f6');
    window.dispatchEvent(new CustomEvent('mb-theme', { detail: preference }));
  }
  window.mbSetTheme = value => { try { localStorage.setItem('mb-theme', value); } catch {} apply(value); };
  window.mbGetTheme = () => preference;
  media.addEventListener('change', () => apply(preference));
  addEventListener('storage', e => { if (e.key === 'mb-theme') apply(e.newValue || 'system'); });
  apply(preference);
})();
