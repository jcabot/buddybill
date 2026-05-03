// Lazy SW registration; vite-plugin-pwa generates the SW.
export function registerSW(): void {
  if (typeof window === 'undefined') return;
  if (!('serviceWorker' in navigator)) return;
  // Dynamic import keeps `workbox-window` out of the initial bundle.
  void import('virtual:pwa-register').then(({ registerSW }) => {
    registerSW({ immediate: true });
  });
}
