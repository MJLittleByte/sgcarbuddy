/* SG Car Buddy concept boards: icon sprite, device chrome and theme toggle.
   One outline family (24px grid, 1.8 stroke), same rules as SG BusXing. Use: <svg class="i"><use href="#i-park"/></svg> */
(function () {
  const outline = {
    search: '<circle cx="11" cy="11" r="7"/><path d="m20 20-3.6-3.6"/>',
    locate: '<circle cx="12" cy="12" r="6.5"/><circle cx="12" cy="12" r="2"/><path d="M12 2.5v3M12 18.5v3M2.5 12h3M18.5 12h3"/>',
    pin: '<path d="M12 21s-7-6.1-7-11.4a7 7 0 0 1 14 0C19 14.9 12 21 12 21z"/><circle cx="12" cy="9.6" r="2.4"/>',
    right: '<path d="m9 6 6 6-6 6"/>',
    left: '<path d="m15 6-6 6 6 6"/>',
    down: '<path d="m6 9 6 6 6-6"/>',
    up: '<path d="m6 15 6-6 6 6"/>',
    x: '<path d="M6 6l12 12M18 6 6 18"/>',
    check: '<path d="m5 12.5 4.5 4.5L19 7.5"/>',
    sliders: '<path d="M4 7h9M17 7h3M4 17h3M11 17h9"/><circle cx="15" cy="7" r="2"/><circle cx="9" cy="17" r="2"/>',
    sort: '<path d="M7.5 4v16M4 16.5 7.5 20l3.5-3.5"/><path d="M16.5 20V4M13 7.5 16.5 4 20 7.5"/>',
    clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3.2 2"/>',
    walk: '<circle cx="13.5" cy="4.5" r="1.7"/><path d="M9 21l2.2-6.3L14 17v4"/><path d="M7 11.5l3.2-3.2 3.3.9 1.9 3h3"/><path d="M11.2 14.7l1.1-5.3"/>',
    home: '<path d="M3.5 11 12 4l8.5 7"/><path d="M5.5 9.5V20h13V9.5"/><path d="M10 20v-5h4v5"/>',
    work: '<rect x="3" y="7" width="18" height="13" rx="2.5"/><path d="M8.5 7V5.5A2 2 0 0 1 10.5 3.5h3a2 2 0 0 1 2 2V7"/><path d="M3 12.5h18"/>',
    staro: '<path d="m12 3.5 2.6 5.4 5.9.8-4.3 4.1 1 5.8L12 16.8l-5.2 2.8 1-5.8-4.3-4.1 5.9-.8z"/>',
    more: '<path d="M12 5.5h.01M12 12h.01M12 18.5h.01"/>',
    gear: '<circle cx="12" cy="12" r="3"/><path d="M19.4 13.5a7.6 7.6 0 0 0 0-3l2-1.6-2-3.4-2.4 1a7.5 7.5 0 0 0-2.6-1.5L14 2.5h-4l-.4 2.5A7.5 7.5 0 0 0 7 6.5l-2.4-1-2 3.4 2 1.6a7.6 7.6 0 0 0 0 3l-2 1.6 2 3.4 2.4-1a7.5 7.5 0 0 0 2.6 1.5l.4 2.5h4l.4-2.5a7.5 7.5 0 0 0 2.6-1.5l2.4 1 2-3.4z"/>',
    layers: '<path d="m12 3.5 8.5 4.5L12 12.5 3.5 8z"/><path d="m3.5 12 8.5 4.5 8.5-4.5"/><path d="m3.5 16 8.5 4.5 8.5-4.5"/>',
    map: '<path d="M9 4 3.5 6v14L9 18l6 2 5.5-2V4L15 6z"/><path d="M9 4v14M15 6v14"/>',
    list: '<path d="M9 6h11M9 12h11M9 18h11M4.5 6h.01M4.5 12h.01M4.5 18h.01"/>',
    grid: '<rect x="3.5" y="3.5" width="7" height="7" rx="1.5"/><rect x="13.5" y="3.5" width="7" height="7" rx="1.5"/><rect x="3.5" y="13.5" width="7" height="7" rx="1.5"/><rect x="13.5" y="13.5" width="7" height="7" rx="1.5"/>',
    refresh: '<path d="M20 11a8 8 0 0 0-14.7-4.4L4 8"/><path d="M4 4v4h4"/><path d="M4 13a8 8 0 0 0 14.7 4.4L20 16"/><path d="M20 20v-4h-4"/>',
    share: '<path d="M12 15V3.5M8 7.5l4-4 4 4"/><path d="M5 12v6.5A1.5 1.5 0 0 0 6.5 20h11a1.5 1.5 0 0 0 1.5-1.5V12"/>',
    nav: '<path d="M20.5 3.5 3.5 11l7.2 2.3 2.3 7.2z"/>',
    alert: '<path d="M10.3 4.2 2.6 18a2 2 0 0 0 1.7 3h15.4a2 2 0 0 0 1.7-3L13.7 4.2a2 2 0 0 0-3.4 0z"/><path d="M12 10v4M12 17.3v.2"/>',
    info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v5.5M12 7.5v.2"/>',
    park: '<rect x="3.5" y="3.5" width="17" height="17" rx="4.5"/><path d="M9.6 16.8V7.4h3.3a2.8 2.8 0 0 1 0 5.6H9.6"/>',
    bolt: '<path d="M13.2 2.8 5.2 13.4h6.1l-1 7.8 8.1-10.8h-6.2z"/>',
    plug: '<path d="M9 2.8v4.4M15 2.8v4.4"/><path d="M6.5 7.2h11v3.3a5.5 5.5 0 0 1-11 0z"/><path d="M12 16v5.2"/>',
    cctv: '<path d="M3.2 6.6 16 3.4a1 1 0 0 1 1.2.7l1.2 4.8a1 1 0 0 1-.7 1.2L4.9 13.3a1 1 0 0 1-1.2-.7L2.5 7.8a1 1 0 0 1 .7-1.2z"/><path d="m18.3 7.5 2.9-.7.6 2.5"/><circle cx="6.6" cy="8.9" r=".6"/><path d="m9 12.2.9 3.6H5.3M5.3 13.8v6.7"/>',
    road: '<path d="M8.5 3.5 4.5 20.5M15.5 3.5l4 17"/><path d="M12 4.5v2.5M12 10.5V13M12 16.5V19"/>',
    rain: '<path d="M7 15.5a4 4 0 0 1-.4-8 5.5 5.5 0 0 1 10.6 1.4 3.4 3.4 0 0 1-.2 6.6z"/><path d="m8.5 18.5-1 2M12.5 18.5l-1 2M16.5 18.5l-1 2"/>',
    cloud: '<path d="M7 18.5a4.5 4.5 0 0 1-.6-9 5.8 5.8 0 0 1 11.2 1.6 3.7 3.7 0 0 1-.1 7.4z"/>',
    sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2.5v2M12 19.5v2M2.5 12h2M19.5 12h2M5.3 5.3l1.4 1.4M17.3 17.3l1.4 1.4M5.3 18.7l1.4-1.4M17.3 6.7l1.4-1.4"/>',
    partsun: '<path d="M8.5 3v1.5M3 8.5h1.5M4.6 4.6l1 1M12.4 4.6l-1 1"/><path d="M5.8 11.2a3.6 3.6 0 1 1 6.3-3.5"/><path d="M9 19.5a3.6 3.6 0 0 1-.4-7.2 4.7 4.7 0 0 1 9 1.2 3 3 0 0 1-.1 6z"/>',
    storm: '<path d="M7 15.5a4 4 0 0 1-.4-8 5.5 5.5 0 0 1 10.6 1.4 3.4 3.4 0 0 1-.2 6.6"/><path d="m12.5 12-2.5 4h3.5L11 20"/>',
    umbrella: '<path d="M3.5 12a8.5 8.5 0 0 1 17 0z"/><path d="M12 12v6a2 2 0 0 1-4 0"/><path d="M12 3.5v-1"/>',
    thermo: '<path d="M10 13.6V5a2 2 0 0 1 4 0v8.6a4 4 0 1 1-4 0z"/><path d="M12 9.5v6"/>',
    radar: '<circle cx="12" cy="12" r="8.5"/><circle cx="12" cy="12" r="4.5"/><path d="M12 12 18 6"/>',
    play: '<path d="M7.5 5v14l11-7z"/>',
    pause: '<path d="M8 5v14M16 5v14"/>',
    car: '<path d="M4.5 17v-4.6L6.8 7a2 2 0 0 1 1.8-1.2h6.8A2 2 0 0 1 17.2 7l2.3 5.4V17"/><path d="M3.5 12.4h17"/><path d="M4.5 17h15v1.8a.9.9 0 0 1-.9.9h-1.7a.9.9 0 0 1-.9-.9V17M7.9 17v1.8a.9.9 0 0 1-.9.9H5.4a.9.9 0 0 1-.9-.9V17"/><path d="M7 14.6h1.5M15.5 14.6H17"/>',
    height: '<path d="M4 3.5h16M4 20.5h16"/><path d="M12 6.5v11M9 9l3-2.5L15 9M9 15l3 2.5 3-2.5"/>',
    roof: '<path d="M2.5 9.5 12 4l9.5 5.5"/><path d="M5 9v11.5M19 9v11.5"/><path d="M5 15.5h14"/>',
    moon: '<path d="M20 14.6A8.2 8.2 0 1 1 9.4 4a6.6 6.6 0 0 0 10.6 10.6z"/>',
    ticket: '<path d="M3.5 7.5a2 2 0 0 0 2-2h13a2 2 0 0 0 2 2v9a2 2 0 0 0-2 2h-13a2 2 0 0 0-2-2z"/><path d="M14.5 5.5v13"/>',
    cone: '<path d="M9.7 4h4.6l4 15H5.7z"/><path d="M8.1 10.5h7.8M6.9 15h10.2"/><path d="M3.5 19.5h17"/>',
    flood: '<path d="M3 13.5c1.5 0 1.5-1.2 3-1.2s1.5 1.2 3 1.2 1.5-1.2 3-1.2 1.5 1.2 3 1.2 1.5-1.2 3-1.2 1.5 1.2 3 1.2"/><path d="M3 18c1.5 0 1.5-1.2 3-1.2S7.5 18 9 18s1.5-1.2 3-1.2 1.5 1.2 3 1.2 1.5-1.2 3-1.2 1.5 1.2 3 1.2"/><path d="M7 9.5 12 5l5 4.5"/>',
    expand: '<path d="M14.5 3.5h6v6M9.5 20.5h-6v-6M20.5 3.5 14 10M3.5 20.5 10 14"/>',
    timer: '<circle cx="12" cy="13.5" r="7.5"/><path d="M12 9.5v4l2.5 1.5M9.5 2.5h5"/>',
    user: '<circle cx="12" cy="8" r="4"/><path d="M4.5 20.5a7.5 7.5 0 0 1 15 0"/>',
    bell: '<path d="M6 16v-5a6 6 0 0 1 12 0v5l1.8 2H4.2z"/><path d="M10 21h4"/>'
  };
  const filled = {
    star: '<path d="m12 3 2.7 5.7 6.3.8-4.6 4.3 1.2 6.2L12 17l-5.6 3 1.2-6.2L3 9.5l6.3-.8z"/>',
    dot: '<circle cx="12" cy="12" r="5"/>',
    boltf: '<path d="M13.2 2.8 5.2 13.4h6.1l-1 7.8 8.1-10.8h-6.2z"/>',
    playf: '<path d="M7.5 4.8v14.4a.8.8 0 0 0 1.2.7l11.3-7.2a.8.8 0 0 0 0-1.4L8.7 4.1a.8.8 0 0 0-1.2.7z"/>',
    navf: '<path d="M20.5 3.5 3.5 11l7.2 2.3 2.3 7.2z"/>',
    pinf: '<path d="M12 22s-7.5-6.4-7.5-12.1a7.5 7.5 0 0 1 15 0C19.5 15.6 12 22 12 22zm0-9.4a2.7 2.7 0 1 0 0-5.4 2.7 2.7 0 0 0 0 5.4z"/>'
  };

  let sprite = '<svg xmlns="http://www.w3.org/2000/svg" style="position:absolute;width:0;height:0;overflow:hidden" aria-hidden="true">';
  for (const [id, body] of Object.entries(outline)) sprite += `<symbol id="i-${id}" viewBox="0 0 24 24">${body}</symbol>`;
  for (const [id, body] of Object.entries(filled)) sprite += `<symbol id="i-${id}" viewBox="0 0 24 24">${body}</symbol>`;
  sprite += '</svg>';
  document.body.insertAdjacentHTML('afterbegin', sprite);

  const statusbar = (time) => `
    <div class="statusbar" aria-hidden="true"><span>${time}</span><span class="sb-icons">
      <svg width="17" height="12" viewBox="0 0 17 12"><rect x="0" y="8" width="3" height="4" rx="1"/><rect x="4.5" y="5.5" width="3" height="6.5" rx="1"/><rect x="9" y="3" width="3" height="9" rx="1"/><rect x="13.5" y="0" width="3" height="12" rx="1"/></svg>
      <svg width="16" height="12" viewBox="0 0 16 12"><path d="M8 11.5 5.6 8.9a3.4 3.4 0 0 1 4.8 0zM3.4 6.6a6.6 6.6 0 0 1 9.2 0l-1.4 1.5a4.6 4.6 0 0 0-6.4 0zM1 4.1a10 10 0 0 1 14 0l-1.4 1.5a8 8 0 0 0-11.2 0z"/></svg>
      <svg width="25" height="12" viewBox="0 0 25 12"><rect x=".5" y=".5" width="21" height="11" rx="3" fill="none" stroke="currentColor" opacity=".5"/><rect x="2" y="2" width="16" height="8" rx="1.6"/><rect x="22.6" y="4" width="1.8" height="4" rx=".9" opacity=".5"/></svg>
    </span></div><div class="punch"></div>`;

  document.querySelectorAll('.phone').forEach((phone) => {
    phone.insertAdjacentHTML('afterbegin', statusbar(phone.dataset.time || '5:42'));
    phone.insertAdjacentHTML('beforeend', '<div class="gesture"></div>');
  });

  // Theme: ?theme=dark|light, else the board's data-default-theme, else light.
  const root = document.documentElement;
  const params = new URLSearchParams(location.search);
  const apply = (t) => {
    root.dataset.theme = t;
    root.classList.toggle('page-dark', t === 'dark');
    document.querySelectorAll('[data-theme-label]').forEach((el) => { el.textContent = t === 'dark' ? 'Show light theme' : 'Show dark theme'; });
  };
  apply(params.get('theme') || root.dataset.defaultTheme || 'light');
  document.querySelectorAll('[data-theme-toggle]').forEach((btn) => btn.addEventListener('click', () => apply(root.dataset.theme === 'dark' ? 'light' : 'dark')));
})();
