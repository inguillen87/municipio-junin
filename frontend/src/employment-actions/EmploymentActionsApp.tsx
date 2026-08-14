import { useGovernedSurface } from '../auth/use-governed-surface';
import { AppShell } from '../components/AppShell';
import { EmploymentActionsDashboard } from './EmploymentActionsDashboard';
import { fetchEmploymentActionsContract } from './employment-actions-contract';
import type { EmploymentActionsViewModel } from './employment-actions-types';
import { buildEmploymentActionsViewModel } from './employment-actions-view-model';

const REQUIRED_CAPABILITY = 'navigation.employment-actions';
const NAVIGATION = Object.freeze({
  activeItemId: 'trayectoria',
  itemIds: Object.freeze(['workspace', 'grh-ejecutivo', 'trayectoria', 'ia']),
});

async function loadEmploymentActions(signal: AbortSignal): Promise<EmploymentActionsViewModel> {
  const contract = await fetchEmploymentActionsContract({ signal });
  return buildEmploymentActionsViewModel(contract);
}

export function EmploymentActionsApp() {
  const { retry, state } = useGovernedSurface({
    loadViewModel: loadEmploymentActions,
    requiredCapability: REQUIRED_CAPABILITY,
  });

  return (
    <AppShell identity={state.identity} navigation={NAVIGATION} busy={state.status === 'loading'}>
      {state.status === 'loading' ? (
        <section className="actions-state" aria-live="polite" aria-busy="true">
          <span className="actions-state__loader" aria-hidden="true" />
          <h1>Preparando trayectoria laboral</h1>
          <p>Verificamos la sesión, el municipio y la información completa antes de mostrar cifras.</p>
        </section>
      ) : null}
      {state.status === 'blocked' ? (
        <section className="actions-state actions-state--blocked" role="alert" tabIndex={-1}>
          <p className="actions-eyebrow">Sin datos parciales</p>
          <h1>No pudimos verificar las actuaciones</h1>
          <p>No mostramos cifras de reemplazo. Podés reintentar la consulta completa.</p>
          <button type="button" onClick={retry}>Reintentar</button>
        </section>
      ) : null}
      {state.status === 'ready' ? <EmploymentActionsDashboard viewModel={state.viewModel} /> : null}
    </AppShell>
  );
}
