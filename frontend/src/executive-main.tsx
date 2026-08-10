import { createRoot } from 'react-dom/client';

import { ExecutiveApp } from './executive/ExecutiveApp';
import './styles/app.css';
import './styles/executive.css';

const rootElement = document.getElementById('root');

if (!rootElement) {
  throw new Error('No se encontró el contenedor principal del tablero ejecutivo GRH.');
}

createRoot(rootElement).render(<ExecutiveApp />);
