import js from '@eslint/js'
import globals from 'globals'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import tseslint from 'typescript-eslint'
import { defineConfig, globalIgnores } from 'eslint/config'

export default defineConfig([
  globalIgnores(['dist']),
  {
    files: ['**/*.{ts,tsx}'],
    extends: [
      js.configs.recommended,
      tseslint.configs.recommended,
      reactHooks.configs.flat.recommended,
      reactRefresh.configs.vite,
    ],
    languageOptions: {
      globals: globals.browser,
    },
    rules: {
      // Este app usa DE PROPÓSITO refs imperativas + atualização direta do DOM para
      // animação em alta frequência (mapa/replay em requestAnimationFrame, sem
      // setState por frame) — ver frontend/DESIGN-UI.md. As regras estritas do React
      // Compiler abaixo sinalizam ESSE padrão intencional; ficam como AVISO (não erro)
      // para o lint seguir útil sem forçar reescrever o render tunado e já aprovado.
      'react-hooks/refs': 'warn',
      'react-hooks/immutability': 'warn',
      'react-hooks/preserve-manual-memoization': 'warn',
      'react-hooks/set-state-in-effect': 'warn',
      'react-hooks/purity': 'warn',
      'react-hooks/exhaustive-deps': 'warn',
      // Contratos frouxos na fronteira da API — limpeza cosmética adiada (review CODEX).
      '@typescript-eslint/no-explicit-any': 'warn',
      // Fast Refresh: export não-componente pontual — cosmético.
      'react-refresh/only-export-components': 'warn',
    },
  },
])
