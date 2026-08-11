import { createRoot } from 'react-dom/client';

import { StructureApp } from './structure/StructureApp';
import './styles/app.css';
import './styles/structure.css';

const rootElement = document.getElementById('root');

if (!rootElement) {
  throw new Error('No se encontró el contenedor principal de la sala de situación GRH.');
}

createRoot(rootElement).render(<StructureApp />);
