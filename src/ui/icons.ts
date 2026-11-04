// Small hand-made SVG icons (UI only).
const svg = (body: string, vb = '0 0 24 24'): string => `<svg viewBox="${vb}" aria-hidden="true" focusable="false">${body}</svg>`;

export const ICONS = {
  food: svg('<path d="M12 22V9" stroke="#b7791f" stroke-width="2" stroke-linecap="round"/><ellipse cx="12" cy="5" rx="2.4" ry="3.6" fill="#f6c34a"/><ellipse cx="8.2" cy="9.6" rx="2.2" ry="3.4" transform="rotate(-35 8.2 9.6)" fill="#f2b33a"/><ellipse cx="15.8" cy="9.6" rx="2.2" ry="3.4" transform="rotate(35 15.8 9.6)" fill="#f2b33a"/><ellipse cx="8.4" cy="15" rx="2.1" ry="3.2" transform="rotate(-40 8.4 15)" fill="#e9a52e"/><ellipse cx="15.6" cy="15" rx="2.1" ry="3.2" transform="rotate(40 15.6 15)" fill="#e9a52e"/>'),
  wood: svg('<rect x="2.5" y="8" width="17" height="9" rx="4.5" fill="#a8663a"/><ellipse cx="19" cy="12.5" rx="3.2" ry="4.5" fill="#e3b77e"/><ellipse cx="19" cy="12.5" rx="1.8" ry="2.6" fill="none" stroke="#b9824a" stroke-width="1"/><path d="M6 10.5h7M5 14.5h9" stroke="#8a4f2a" stroke-width="1.2" stroke-linecap="round"/>'),
  stone: svg('<path d="M4 17l2.5-7 5-3.5 6 2 3 6-2 4H6z" fill="#9aa7b4"/><path d="M6.5 10l5-3.5 6 2-4 3z" fill="#c4ced8"/><path d="M13.5 11.5l4-3 3 6-2 4z" fill="#7d8a97"/>'),
  gold: svg('<circle cx="12" cy="12" r="9" fill="#f2b632"/><circle cx="12" cy="12" r="6.6" fill="#ffd45e" stroke="#e09a1a" stroke-width="1.2"/><path d="M12 8.2v7.6M9.8 10h3.6a1.4 1.4 0 010 2.8h-2.8a1.4 1.4 0 000 2.8h3.6" stroke="#c98110" stroke-width="1.4" fill="none" stroke-linecap="round"/>'),
  pop: svg('<circle cx="12" cy="7.5" r="3.6" fill="#f2c9a0"/><path d="M4.8 20c.6-4.4 3.4-6.6 7.2-6.6s6.6 2.2 7.2 6.6z" fill="#5b8bd9"/>'),
  star: svg('<path d="M12 2.8l2.8 5.9 6.4.8-4.7 4.4 1.2 6.4L12 17.1l-5.7 3.2 1.2-6.4-4.7-4.4 6.4-.8z" fill="#ffcf40" stroke="#e5a514" stroke-width="1" stroke-linejoin="round"/>'),
  castle: svg('<path d="M3 21V9h3v2h2V9h3v2h2V9h3v2h2V9h3v12z" fill="currentColor"/><path d="M10.5 21v-4a1.5 1.5 0 013 0v4z" fill="#fff" opacity=".85"/><path d="M12 2v5M12 2l4 1.5L12 5" stroke="currentColor" stroke-width="1.5" fill="none"/>'),
  heroes: svg('<path d="M12 2.5l7.5 3v6c0 5-3.3 8.6-7.5 10-4.2-1.4-7.5-5-7.5-10v-6z" fill="currentColor"/><path d="M12 7.5l1.5 3 3.2.4-2.4 2.2.6 3.2L12 14.8l-2.9 1.5.6-3.2-2.4-2.2 3.2-.4z" fill="#fff" opacity=".9"/>'),
  quests: svg('<path d="M6 3h11a2 2 0 012 2v14a2 2 0 01-2 2H7a3 3 0 01-3-3V5a2 2 0 012-2z" fill="currentColor"/><path d="M8 8h8M8 12h8M8 16h5" stroke="#fff" stroke-width="1.8" stroke-linecap="round" opacity=".9"/>'),
  options: svg('<path d="M10.3 2h3.4l.5 2.7 1.9.8 2.3-1.6 2.4 2.4-1.6 2.3.8 1.9 2.7.5v3.4l-2.7.5-.8 1.9 1.6 2.3-2.4 2.4-2.3-1.6-1.9.8-.5 2.7h-3.4l-.5-2.7-1.9-.8-2.3 1.6-2.4-2.4 1.6-2.3-.8-1.9L2 13.7v-3.4l2.7-.5.8-1.9-1.6-2.3 2.4-2.4 2.3 1.6 1.9-.8z" fill="currentColor"/><circle cx="12" cy="12" r="3.4" fill="#fff" opacity=".9"/>'),
  lock: svg('<rect x="5" y="10.5" width="14" height="10.5" rx="2.5" fill="#8a7a6a"/><path d="M8 10.5V8a4 4 0 018 0v2.5" stroke="#8a7a6a" stroke-width="2.4" fill="none"/><circle cx="12" cy="15.5" r="1.7" fill="#fff"/>'),
  clock: svg('<circle cx="12" cy="12" r="9" fill="#fff" stroke="currentColor" stroke-width="2"/><path d="M12 7v5l3.5 2" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round"/>'),
  play: svg('<rect x="2" y="5" width="20" height="14" rx="4" fill="currentColor"/><path d="M10 9l5 3-5 3z" fill="#fff"/>'),
  hammer: svg('<path d="M14.5 3.5l6 6-2.4 2.4-6-6z" fill="#7d8a97"/><path d="M12.6 7.9l3.5 3.5-9.4 9.4a2.47 2.47 0 01-3.5-3.5z" fill="#a8663a"/>'),
  up: svg('<path d="M12 4l7 7h-4.5v9h-5v-9H5z" fill="currentColor"/>'),
  close: svg('<path d="M6 6l12 12M18 6L6 18" stroke="currentColor" stroke-width="2.6" stroke-linecap="round"/>'),
  check: svg('<path d="M5 12.5l4.5 4.5L19 7.5" stroke="currentColor" stroke-width="3" fill="none" stroke-linecap="round" stroke-linejoin="round"/>'),
  plus: svg('<path d="M12 5v14M5 12h14" stroke="currentColor" stroke-width="3" stroke-linecap="round"/>'),
  sound: svg('<path d="M4 9h4l5-4v14l-5-4H4z" fill="currentColor"/><path d="M16 8.5a5 5 0 010 7M18.5 6a8.5 8.5 0 010 12" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round"/>'),
  music: svg('<path d="M9 18V5l11-2v13" stroke="currentColor" stroke-width="2" fill="none"/><circle cx="6.5" cy="18" r="2.8" fill="currentColor"/><circle cx="17.5" cy="16" r="2.8" fill="currentColor"/>'),
  globe: svg('<circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" stroke-width="2"/><path d="M3 12h18M12 3c3 3.2 3 14.8 0 18M12 3c-3 3.2-3 14.8 0 18" stroke="currentColor" stroke-width="1.6" fill="none"/>'),
  sparkle: svg('<path d="M12 2l2.2 7.8L22 12l-7.8 2.2L12 22l-2.2-7.8L2 12l7.8-2.2z" fill="currentColor"/>'),
  boost: svg('<path d="M13 2L4 14h6l-1 8 9-12h-6z" fill="currentColor"/>'),
} as const;

export type IconName = keyof typeof ICONS;

export const icon = (name: IconName, cls = ''): string => `<span class="ic ${cls}">${ICONS[name]}</span>`;
