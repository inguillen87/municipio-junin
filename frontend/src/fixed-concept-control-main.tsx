import { createRoot } from 'react-dom/client';

import { FixedConceptControlApp } from './fixed-concept-control/FixedConceptControlApp';
import './styles/app.css';
import './styles/fixed-concept-control.css';

const rootElement = document.getElementById('root');

if (!rootElement) {
  throw new Error('No se encontró el contenedor principal del control de conceptos fijos GRH.');
}

createRoot(rootElement).render(<FixedConceptControlApp />);
