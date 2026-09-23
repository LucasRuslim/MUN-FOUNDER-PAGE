import React from 'react'
import ReactDOM from 'react-dom/client'
import '@fontsource-variable/bodoni-moda/opsz.css'
import '@fontsource-variable/bodoni-moda/opsz-italic.css'
import '@fontsource-variable/schibsted-grotesk/wght.css'
import '@fontsource-variable/martian-mono/wdth.css'
import App from './App'
import './index.css'

// Entrance states (hidden-before-reveal) only apply when motion is welcome.
if (!window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
  document.documentElement.classList.add('motion-ok')
}
if ('scrollRestoration' in history) history.scrollRestoration = 'manual'

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)
