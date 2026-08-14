import { createRoot } from 'react-dom/client';

import { GardenNetworkApp } from './garden-network/GardenNetworkApp';
import './styles/app.css';
import './styles/garden-network.css';

const rootElement = document.getElementById('root');

if (!rootElement) {
  throw new Error('No se encontró el contenedor principal de la red de jardines.');
}

createRoot(rootElement).render(<GardenNetworkApp />);
