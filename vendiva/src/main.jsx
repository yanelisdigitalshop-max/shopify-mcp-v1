import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import '@fontsource-variable/figtree';
import './index.css';
import App from './App.jsx';
import { ProveedorEstado } from './estado/Estado.jsx';

createRoot(document.getElementById('raiz')).render(
  <StrictMode>
    <ProveedorEstado>
      <App />
    </ProveedorEstado>
  </StrictMode>,
);
