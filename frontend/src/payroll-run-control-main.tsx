import { createRoot } from 'react-dom/client';

import { PayrollRunControlApp } from './payroll-run-control/PayrollRunControlApp';
import './styles/app.css';
import './styles/payroll-run-control.css';

const rootElement = document.getElementById('root');

if (!rootElement) {
  throw new Error('No se encontró el contenedor principal del control de corridas GRH.');
}

createRoot(rootElement).render(<PayrollRunControlApp />);
