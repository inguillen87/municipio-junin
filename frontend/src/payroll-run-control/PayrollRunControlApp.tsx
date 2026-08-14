import { useGovernedSurface } from '../auth/use-governed-surface';
import { AppShell } from '../components/AppShell';
import { PayrollRunControlDashboard } from './PayrollRunControlDashboard';
import { fetchPayrollRunControlContract } from './payroll-run-control-contract';
import type { PayrollRunControlViewModel } from './payroll-run-control-types';
import { buildPayrollRunControlViewModel } from './payroll-run-control-view-model';

const REQUIRED_CAPABILITY = 'navigation.hacienda';
const NAVIGATION = Object.freeze({
  activeItemId: 'corridas-grh',
  itemIds: Object.freeze(['workspace', 'grh-ejecutivo', 'hacienda', 'corridas-grh', 'conceptos-fijos', 'ia']),
});

async function loadPayrollRunControl(signal: AbortSignal): Promise<PayrollRunControlViewModel> {
  const contract = await fetchPayrollRunControlContract({ signal });
  return buildPayrollRunControlViewModel(contract);
}

export function PayrollRunControlApp() {
  const { retry, state } = useGovernedSurface({
    loadViewModel: loadPayrollRunControl,
    requiredCapability: REQUIRED_CAPABILITY,
  });

  return (
    <AppShell identity={state.identity} navigation={NAVIGATION} busy={state.status === 'loading'}>
      {state.status === 'loading' ? (
        <section className="run-state" aria-live="polite" aria-busy="true">
          <span className="run-state__loader" aria-hidden="true" />
          <h1>Preparando corridas GRH</h1>
          <p>Verificamos la sesión, el municipio y el contrato completo antes de mostrar cifras.</p>
        </section>
      ) : null}
      {state.status === 'blocked' ? (
        <section className="run-state run-state--blocked" role="alert" tabIndex={-1}>
          <p className="run-eyebrow">Sin datos parciales</p>
          <h1>No pudimos verificar el control de corridas</h1>
          <p>No mostramos valores de reemplazo. Podés reintentar la consulta completa.</p>
          <button type="button" onClick={retry}>Reintentar</button>
        </section>
      ) : null}
      {state.status === 'ready' ? <PayrollRunControlDashboard viewModel={state.viewModel} /> : null}
    </AppShell>
  );
}
