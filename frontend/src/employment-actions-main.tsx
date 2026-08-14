import { createRoot } from 'react-dom/client';

import { EmploymentActionsApp } from './employment-actions/EmploymentActionsApp';
import './styles/app.css';
import './styles/employment-actions.css';

const rootElement = document.getElementById('root');

if (!rootElement) {
  throw new Error('No se encontró el contenedor principal de trayectoria laboral.');
}

createRoot(rootElement).render(<EmploymentActionsApp />);
