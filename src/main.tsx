import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import './index.css';

createRoot(document.getElementById('root')!).render(<App />);

if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register(new URL(`${import.meta.env.BASE_URL}sw.js`, document.baseURI)).catch(() => {
      // The page still works online if this host disallows service workers.
    });
  });
}
