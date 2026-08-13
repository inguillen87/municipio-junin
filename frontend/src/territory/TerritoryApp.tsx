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
          title="Comprobando el mapa oficial"
          description="Estamos verificando los permisos y las fuentes necesarias para mostrar el departamento."
        />
      ) : null}
      {state.status === 'blocked' ? (
        <GovernedBlocked
          title="Cartografía no disponible"
          description="No pudimos verificar la fuente territorial necesaria. Por seguridad, el mapa no muestra datos alternativos."
          onRetry={retry}
        />
      ) : null}
      {state.status === 'ready' ? <TerritoryDashboard contract={state.viewModel} /> : null}
    </AppShell>
  );
}
