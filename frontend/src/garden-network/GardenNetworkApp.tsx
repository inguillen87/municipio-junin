import { useGovernedSurface } from '../auth/use-governed-surface';
import { AppShell } from '../components/AppShell';
import { GovernedBlocked, GovernedLoading } from '../components/GovernedStates';
import { fetchGardenNetworkContract } from './garden-network-contract';
import type { GardenNetworkViewModel } from './garden-network-types';
import { buildGardenNetworkViewModel } from './garden-network-view-model';
import { GardenNetworkDashboard } from './GardenNetworkDashboard';

const REQUIRED_CAPABILITY = 'navigation.organization-analytics';
const NAVIGATION = Object.freeze({
  activeItemId: 'gardens',
  itemIds: Object.freeze([
    'workspace', 'dashboard', 'gardens', 'estructura',
  ]),
});

async function loadGardenNetwork(signal: AbortSignal): Promise<GardenNetworkViewModel> {
  const contract = await fetchGardenNetworkContract({ signal });
  return buildGardenNetworkViewModel(contract);
}

export function GardenNetworkApp() {
  const { retry, state } = useGovernedSurface({
    loadViewModel: loadGardenNetwork,
    requiredCapability: REQUIRED_CAPABILITY,
  });

  return (
    <AppShell identity={state.identity} navigation={NAVIGATION} busy={state.status === 'loading'}>
      {state.status === 'loading' ? (
        <GovernedLoading description="Validamos la sesión, el corte de cálculo y las reglas de privacidad antes de mostrar la red." />
      ) : null}
      {state.status === 'blocked' ? (
        <GovernedBlocked
          description="No pudimos validar la red de jardines; no mostramos cifras parciales, unidades pequeñas ni valores de reemplazo."
          onRetry={retry}
        />
      ) : null}
      {state.status === 'ready' ? <GardenNetworkDashboard viewModel={state.viewModel} /> : null}
    </AppShell>
  );
}
