import './profile-normalizer.js';

if (typeof document !== 'undefined' && !document.querySelector('link[data-crt-mobile-fixes]')) {
  const link = document.createElement('link');
  link.rel = 'stylesheet';
  link.href = new URL('./mobile-fixes.css', import.meta.url).href;
  link.dataset.crtMobileFixes = 'true';
  document.head.appendChild(link);
}

export { CRTGL } from './crt-renderer.js';
export { CRTAudio } from './audio.js';
