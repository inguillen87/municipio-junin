import { useGovernedSurface } from '../auth/use-governed-surface';
import { AppShell } from '../components/AppShell';
import { GovernedBlocked, GovernedLoading } from '../components/GovernedStates';
import { fetchFixedConceptControlContract } from './fixed-concept-control-contract';
import type { FixedConceptControlViewModel } from './fixed-concept-control-types';
import { buildFixedConceptControlViewModel } from './fixed-concept-control-view-model';
import { FixedConceptControlDashboard } from './FixedConceptControlDashboard';

const REQUIRED_CAPABILITY = 'navigation.hacienda';
const NAVIGATION = Object.freeze({
  activeItemId: 'conceptos-fijos',
  itemIds: Object.freeze([
    'workspace', 'grh-ejecutivo', 'hacienda', 'corridas-grh', 'conceptos-fijos', 'ia',
  ]),
});

async function loadFixedConceptControl(signal: AbortSignal): Promise<FixedConceptControlViewModel> {
  const contract = await fetchFixedConceptControlContract({ signal });
  return buildFixedConceptControlViewModel(contract);
}

export function FixedConceptControlApp() {
  const { retry, state } = useGovernedSurface({
    loadViewModel: loadFixedConceptControl,
    requiredCapability: REQUIRED_CAPABILITY,
  });

  return (
    <AppShell identity={state.identity} navigation={NAVIGATION} busy={state.status === 'loading'}>
      {state.status === 'loading' ? (
        <GovernedLoading description="Verificamos la sesión, el municipio y el contrato completo antes de mostrar resultados." />
      ) : null}
      {state.status === 'blocked' ? (
        <GovernedBlocked
          description="No pudimos validar el control de conceptos fijos; no mostramos cifras parciales ni valores de reemplazo."
          onRetry={retry}
        />
      ) : null}
      {state.status === 'ready' ? <FixedConceptControlDashboard viewModel={state.viewModel} /> : null}
    </AppShell>
  );
}
