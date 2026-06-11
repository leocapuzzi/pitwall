// Conjunto de ícones do design (portado de chrome.jsx). Stroke icons 24x24.
const ICONS: Record<string, string> = {
  gear: 'M12 15a3 3 0 100-6 3 3 0 000 6z M19.4 13a1.6 1.6 0 00.3 1.8l.1.1a2 2 0 11-2.8 2.8l-.1-.1a1.6 1.6 0 00-2.7 1.1V21a2 2 0 11-4 0v-.1a1.6 1.6 0 00-1-1.5 1.6 1.6 0 00-1.8.4l-.1.1a2 2 0 11-2.8-2.8l.1-.1a1.6 1.6 0 00-1.1-2.7H3a2 2 0 110-4h.1a1.6 1.6 0 001.5-1 1.6 1.6 0 00-.4-1.8l-.1-.1A2 2 0 117.4 4.3l.1.1a1.6 1.6 0 001.8.3H9.4a1.6 1.6 0 001-1.5V3a2 2 0 114 0v.1a1.6 1.6 0 001 1.5 1.6 1.6 0 001.8-.4l.1-.1a2 2 0 112.8 2.8l-.1.1a1.6 1.6 0 00-.3 1.8V9.4a1.6 1.6 0 001.5 1H21a2 2 0 110 4h-.1a1.6 1.6 0 00-1.5 1z',
  bell: 'M18 8a6 6 0 10-12 0c0 7-3 9-3 9h18s-3-2-3-9 M13.7 21a2 2 0 01-3.4 0',
  x: 'M18 6L6 18 M6 6l12 12',
  info: 'M12 22a10 10 0 100-20 10 10 0 000 20z M12 16v-4 M12 8h.01',
  flag: 'M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z M4 22v-7',
  telem: 'M3 12h3l2-7 4 14 3-9 2 2h4',
  clock: 'M12 22a10 10 0 100-20 10 10 0 000 20z M12 6v6l4 2',
  search: 'M11 19a8 8 0 100-16 8 8 0 000 16z M21 21l-4.3-4.3',
  filter: 'M22 3H2l8 9.5V19l4 2v-8.5z',
  play: 'M5 3l14 9-14 9z',
  back: 'M19 12H5 M12 19l-7-7 7-7',
  chevL: 'M15 18l-6-6 6-6', chevR: 'M9 18l6-6-6-6', chevD: 'M6 9l6 6 6-6',
  fuel: 'M3 22V4a2 2 0 012-2h6a2 2 0 012 2v18 M3 13h10 M13 8h3a2 2 0 012 2v6a2 2 0 003 1.7 M19 7l-2-2',
  temp: 'M14 14.8V4a2 2 0 10-4 0v10.8a4 4 0 104 0z',
  weather: 'M12 2v2 M12 20v2 M4.9 4.9l1.4 1.4 M17.7 17.7l1.4 1.4 M2 12h2 M20 12h2 M6.3 17.7l-1.4 1.4 M19.1 4.9l-1.4 1.4 M12 17a5 5 0 100-10 5 5 0 000 10z',
  road: 'M4 19l4-14 M20 19l-4-14 M12 6v2 M12 12v2 M12 18v2',
  diamond: 'M6 3h12l4 6-10 12L2 9z',
  spark: 'M12 3l1.9 5.8L20 9l-5.5 4 2.1 6L12 15.5 7.4 19l2.1-6L4 9l6.1-.2z',
  send: 'M22 2L11 13 M22 2l-7 20-4-9-9-4z',
  refresh: 'M21 2v6h-6 M3 12a9 9 0 0115-6.7L21 8 M3 22v-6h6 M21 12a9 9 0 01-15 6.7L3 16',
  wrench: 'M14.7 6.3a4 4 0 01-5.4 5.4L4 17v3h3l5.3-5.3a4 4 0 015.4-5.4z',
  car: 'M5 17a2 2 0 104 0 M15 17a2 2 0 104 0 M3 17h-1v-5l2-5h12l3 5v5h-1 M5 12h14 M9 17h6',
  wheel: 'M12 21a9 9 0 100-18 9 9 0 000 18z M12 14.5a2.5 2.5 0 100-5 2.5 2.5 0 000 5z M12 9.5V3.2 M9.8 13.6l-5.4 3.1 M14.2 13.6l5.4 3.1',
  oval: 'M12 6c5 0 9 2.7 9 6s-4 6-9 6-9-2.7-9-6 4-6 9-6z',
  trophy: 'M8 21h8 M12 17v4 M7 4h10v5a5 5 0 01-10 0z M7 6H4v2a3 3 0 003 3 M17 6h3v2a3 3 0 01-3 3',
  sliders: 'M4 21v-7 M4 10V3 M12 21v-9 M12 8V3 M20 21v-5 M20 12V3 M1 14h6 M9 8h6 M17 16h6',
  pin: 'M12 21v-6 M8 3h8l-1 7 3 2v3H4v-3l3-2z',
  ext: 'M18 13v6a2 2 0 01-2 2H5a2 2 0 01-2-2V8a2 2 0 012-2h6 M15 3h6v6 M10 14L21 3',
}

export default function Icon({ n, s = 17, sw = 1.9, fill }: { n: string; s?: number; sw?: number; fill?: string }) {
  return (
    <svg width={s} height={s} viewBox="0 0 24 24" fill={fill || 'none'}
      stroke={fill ? 'none' : 'currentColor'} strokeWidth={sw} strokeLinecap="round" strokeLinejoin="round">
      <path d={ICONS[n]} />
    </svg>
  )
}
