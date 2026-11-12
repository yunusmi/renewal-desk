import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';

// Placeholder until stage 5 (core UI).
createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <main style={{ fontFamily: 'Arial, sans-serif' }}>
      <h1>RenewalDesk</h1>
    </main>
  </StrictMode>,
);
