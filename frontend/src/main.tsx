import { createRoot } from 'react-dom/client';

import { App } from './app/App';
import './styles/app.css';

const rootElement = document.getElementById('root');

if (!rootElement) {
  throw new Error('No se encontró el contenedor principal de Calidad GRH.');
}

createRoot(rootElement).render(<App />);
