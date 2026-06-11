import { useEffect, useState } from 'react'
import type { ComponentType } from 'react'
import { TopNav, SessionStrip, StatusBar } from './components/Chrome'
import type { View } from './lib/api'
import Dashboard from './screens/Dashboard'
import Telemetry from './screens/Telemetry'
import LapAnalysis from './screens/LapAnalysis'
import Stint from './screens/Stint'
import Comparison from './screens/Comparison'
import AIEngineer from './screens/AIEngineer'

const TITLES: Record<View, string> = {
  dashboard: 'Dashboard', stint: 'Stint Overview', telemetry: 'Telemetry',
  lap: 'Lap Analysis', comparison: 'Comparison', ai: 'Race Engineer AI',
}
const SUBS: Record<View, string> = {
  dashboard: 'Your season at a glance', stint: 'Lap-by-lap breakdown of your stint',
  telemetry: 'Your lap vs the reference, channel by channel',
  lap: 'Where you gain and lose time, corner by corner',
  comparison: 'Two laps, side by side', ai: 'Post-session analysis from your AI race engineer',
}
const SCREENS: Record<View, ComponentType> = {
  dashboard: Dashboard, telemetry: Telemetry, lap: LapAnalysis,
  stint: Stint, comparison: Comparison, ai: AIEngineer,
}
// telas que renderizam o próprio cabeçalho (padrão GO Fast) — sem scr-head genérico
const SELF_HEADED = new Set<View>(['stint', 'dashboard', 'ai'])

export default function App() {
  const [view, setView] = useState<View>(() => {
    try { return (localStorage.getItem('pw_view') as View) || 'telemetry' } catch { return 'telemetry' }
  })
  useEffect(() => { try { localStorage.setItem('pw_view', view) } catch { /* ignore */ } }, [view])

  // navegação disparada de dentro das telas (ex.: chip "Ver na Telemetry" da Lap)
  useEffect(() => {
    const onGo = (e: Event) => { const v = (e as CustomEvent).detail as View; if (SCREENS[v]) setView(v) }
    window.addEventListener('pw:go', onGo)
    return () => window.removeEventListener('pw:go', onGo)
  }, [])

  const Screen = SCREENS[view]
  // modo FULLMAP (estilo GO Fast): o mapa vive atrás de TUDO e a UI flutua em vidro.
  // A classe também vai no <body> p/ liberar o mouse do #root (CSS body.fullmap #root).
  const fullmap = view === 'lap' || view === 'telemetry' || view === 'comparison'
  useEffect(() => {
    document.body.classList.toggle('fullmap', fullmap)
    return () => document.body.classList.remove('fullmap')
  }, [fullmap])
  return (
    <div className={'app' + (fullmap ? ' fullmap' : '')}>
      <TopNav view={view} go={setView} />
      {view !== 'dashboard' && <SessionStrip view={view} go={setView} />}
      <main className="stage">
        <div className="screen on">
          {!SELF_HEADED.has(view) && (
            <div className="scr-head">
              <div>
                <h1 style={{ fontFamily: 'var(--font-display)', fontSize: 24, fontWeight: 800, margin: 0, letterSpacing: '-.01em' }}>{TITLES[view]}</h1>
                <div className="vt-desc">{SUBS[view]}</div>
              </div>
            </div>
          )}
          <Screen />
        </div>
      </main>
      <StatusBar />
    </div>
  )
}
