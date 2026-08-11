import { AUTH_TIMEOUT_MS } from '../auth/session';
import { useGovernedSurface } from '../auth/use-governed-surface';
import { AppShell } from '../components/AppShell';
import { GovernedBlocked, GovernedLoading } from '../components/GovernedStates';
import type { TopbarLink } from '../components/Topbar';
import { fetchMunicipalTerritory } from './territory-contract';
import { TerritoryDashboard } from './TerritoryDashboard';

const REQUIRED_CAPABILITY = 'navigation.territory';
const TERRITORY_NAVIGATION: readonly TopbarLink[] = Object.freeze([
  { href: '/inicio.html', label: 'Inicio' },
  { href: '/territorio', label: 'Territorio', current: true },
  { href: '/manuales.html', label: 'Manual' },
]);

async function loadTerritory(signal: AbortSignal) {
  return fetchMunicipalTerritory(signal);
}

export function TerritoryApp() {
  const { retry, state } = useGovernedSurface({
    loadViewModel: loadTerritory,
    requiredCapability: REQUIRED_CAPABILITY,
  });

  return (
    <AppShell
      identity={state.identity}
      links={TERRITORY_NAVIGATION}
      busy={state.status === 'loading'}
    >
      {state.status === 'loading' ? (
        <GovernedLoading
          title="Validando Centro Territorial"
          description={`Confirmamos sesión, capacidad territorial y fuentes oficiales antes de montar el mapa. Tiempo máximo de validación: ${AUTH_TIMEOUT_MS / 1_000} segundos.`}
        />
      ) : null}
      {state.status === 'blocked' ? (
        <GovernedBlocked
          title="Cartografía no disponible"
          description="La fuente territorial requerida no está disponible o su contrato fue rechazado. No se dibuja ninguna geometría alternativa."
          onRetry={retry}
        />
      ) : null}
      {state.status === 'ready' ? <TerritoryDashboard contract={state.viewModel} /> : null}
    </AppShell>
  );
}
