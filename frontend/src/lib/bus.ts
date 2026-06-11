// Correio entre telas (sobrevive a uma troca de view; consumido uma vez).
// Ex.: clicar numa curva do minimapa da Lap abre a Telemetry com o trecho recortado.
export interface PendingFocus { lo: number; hi: number; t: number }

let pendingFocus: PendingFocus | null = null

export function setPendingFocus(f: PendingFocus) { pendingFocus = f }
export function takePendingFocus(): PendingFocus | null { const f = pendingFocus; pendingFocus = null; return f }
