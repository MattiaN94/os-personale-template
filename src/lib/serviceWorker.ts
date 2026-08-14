// Retires any service worker left by an earlier build.
//
// A precaching worker behind Cloudflare Access is a trap: Workbox installs by
// fetching every precached asset, an absent or expired Access session answers
// those fetches with a 302 to a cross-origin login page, and the install dies
// with "Failed to fetch". Worse, once a broken worker is installed it keeps
// controlling the page, and its own update check fetches /sw.js — which cannot
// follow a redirect either, so it can never heal itself.
//
// This runs from the page, which by definition already crossed Access, so the
// unregister always succeeds. It is the reliable path; the self-destroying
// /sw.js still shipped by the build is the fallback for clients that reach the
// worker before they reach this code.
export async function retireServiceWorkers() {
  if (!('serviceWorker' in navigator)) return
  try {
    const registrations = await navigator.serviceWorker.getRegistrations()
    if (registrations.length) await Promise.all(registrations.map((registration) => registration.unregister()))
    // Caches outlive the registration, so a stale shell could still be served.
    if ('caches' in window) {
      const keys = await caches.keys()
      await Promise.all(keys.map((key) => caches.delete(key)))
    }
  } catch {
    // A browser that refuses the cleanup is left exactly as it was: the app
    // itself never depends on a service worker being present or absent.
  }
}
