import { App } from '@dev/app';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';

const root = document.getElementById('root');

if (root === null) {
  throw new Error('Missing #root element');
}

createRoot(root).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
