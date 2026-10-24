import React from 'react'
import ReactDOM from 'react-dom/client'
import App from '@/App.jsx'
import '@/index.css'
import { ThemeProvider } from '@/lib/ThemeContext'
import { LanguageProvider } from '@/lib/LanguageContext'

// The app uses platform-managed custodial wallets and never connects to
// MetaMask. The "Failed to connect to MetaMask" rejection is thrown by the
// MetaMask browser extension's injected inpage script, not by app code, so
// swallow it before it surfaces as an unhandled app error.
const swallowMetaMask = (reason) => {
  const msg = (reason?.message || String(reason || '')).toLowerCase();
  const stack = reason?.stack || '';
  return /metamask/i.test(msg) || /failed to connect to metamask/i.test(msg) || stack.includes('inpage.js');
};
window.addEventListener('unhandledrejection', (e) => {
  if (swallowMetaMask(e.reason)) e.preventDefault();
});
window.addEventListener('error', (e) => {
  if (swallowMetaMask(e.error || e.message)) { e.preventDefault(); e.stopImmediatePropagation?.(); }
});

ReactDOM.createRoot(document.getElementById('root')).render(
  <ThemeProvider>
    <LanguageProvider>
      <App />
    </LanguageProvider>
  </ThemeProvider>
)