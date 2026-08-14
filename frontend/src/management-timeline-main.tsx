import { createRoot } from 'react-dom/client';

import { ManagementTimelineApp } from './management-timeline/ManagementTimelineApp';
import './styles/app.css';
import './styles/management-timeline.css';

const rootElement = document.getElementById('root');

if (!rootElement) {
  throw new Error('No se encontró el contenedor principal de la comparación de gestiones.');
}

createRoot(rootElement).render(<ManagementTimelineApp />);
