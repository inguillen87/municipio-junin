import { AUTH_TIMEOUT_MS } from '../auth/session';
import { useGovernedSurface } from '../auth/use-governed-surface';
import { AppShell } from '../components/AppShell';
import { GovernedBlocked, GovernedLoading } from '../components/GovernedStates';
import { fetchMunicipalTerritory } from './territory-contract';
import { TerritoryDashboard } from './TerritoryDashboard';

const REQUIRED_CAPABILITY = 'navigation.territory';
const TERRITORY_NAVIGATION = Object.freeze({
  activeItemId: 'territorio',
  itemIds: Object.freeze(['workspace', 'territorio', 'manuales']),
});

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
      navigation={TERRITORY_NAVIGATION}
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
