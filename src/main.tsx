import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { retireServiceWorkers } from './lib/serviceWorker'

// Fire and forget: rendering must not wait on the cleanup, and the application
// works identically whether or not a stale worker was there to remove.
void retireServiceWorkers()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
