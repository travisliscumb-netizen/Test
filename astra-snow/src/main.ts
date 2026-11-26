import './styles/app.css';
import { App } from './ui/app.ts';
import { View } from './ui/view.ts';

const app = new App();
new View(app, document.getElementById('app')!);
void app.boot();

if ('serviceWorker' in navigator && location.hostname !== '127.0.0.1' && location.hostname !== 'localhost') {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(() => {
      /* offline shell unavailable; the app still runs online */
    });
  });
}

// Debug/test hook (no secrets on it): lets the end-to-end suite drive GPS.
(window as unknown as { __astra: App }).__astra = app;
