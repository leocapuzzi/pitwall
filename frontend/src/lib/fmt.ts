// Formatação compartilhada de tempos de volta.
export function parseLap(s?: string) { if (!s) return 90; const m = String(s).match(/(\d+):([\d.]+)/); return m ? +m[1] * 60 + +m[2] : parseFloat(s) || 90 }
export function fmtClock(sec: number) { const m = Math.floor(sec / 60), s = sec - m * 60; return m + ':' + s.toFixed(3).padStart(6, '0') }
