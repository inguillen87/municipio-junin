import { useGovernedSurface } from '../auth/use-governed-surface';
import { AppShell } from '../components/AppShell';
import { GovernedBlocked, GovernedLoading } from '../components/GovernedStates';
import { fetchManagementTimelineContract } from './management-timeline-contract';
import type { ManagementTimelineViewModel } from './management-timeline-types';
import { buildManagementTimelineViewModel } from './management-timeline-view-model';
import { ManagementTimelineDashboard } from './ManagementTimelineDashboard';

const REQUIRED_CAPABILITY = 'navigation.dashboard';
const NAVIGATION = Object.freeze({
  activeItemId: 'gestiones',
  itemIds: Object.freeze([
    'workspace', 'dashboard', 'gestiones', 'grh-ejecutivo', 'ia', 'reportes',
  ]),
});

async function loadManagementTimeline(signal: AbortSignal): Promise<ManagementTimelineViewModel> {
  const contract = await fetchManagementTimelineContract({ signal });
  return buildManagementTimelineViewModel(contract);
}

export function ManagementTimelineApp() {
  const { retry, state } = useGovernedSurface({
    loadViewModel: loadManagementTimeline,
    requiredCapability: REQUIRED_CAPABILITY,
  });

  return (
    <AppShell identity={state.identity} navigation={NAVIGATION} busy={state.status === 'loading'}>
      {state.status === 'loading' ? (
        <GovernedLoading description="Verificamos la sesión, el municipio y las ventanas completas antes de mostrar la comparación." />
      ) : null}
      {state.status === 'blocked' ? (
        <GovernedBlocked
          description="No pudimos validar la comparación de gestiones; no mostramos cifras parciales, protegidas ni valores de reemplazo."
          onRetry={retry}
        />
      ) : null}
      {state.status === 'ready' ? <ManagementTimelineDashboard viewModel={state.viewModel} /> : null}
    </AppShell>
  );
}
