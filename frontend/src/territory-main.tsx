import { createRoot } from 'react-dom/client';

import { TerritoryApp } from './territory/TerritoryApp';
import './styles/app.css';
import 'leaflet/dist/leaflet.css';
import './styles/territory.css';

const rootElement = document.getElementById('root');

if (!rootElement) {
  throw new Error('No se encontró el contenedor principal del Centro Territorial Junín.');
}

createRoot(rootElement).render(<TerritoryApp />);
