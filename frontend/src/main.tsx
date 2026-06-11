import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './styles/pitwall.css'
import './styles/components.css'
import App from './App'
import { initLiquidGlass } from './lib/liquidGlass'

// liquid glass físico (filtros por painel) — observa o DOM a partir daqui
initLiquidGlass()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
