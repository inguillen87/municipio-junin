import { AUTH_TIMEOUT_MS } from '../auth/session';
import { useGovernedSurface } from '../auth/use-governed-surface';
import { AppShell } from '../components/AppShell';
import { GovernedBlocked, GovernedLoading } from '../components/GovernedStates';
import type { TopbarLink } from '../components/Topbar';
import { fetchExecutiveContract } from '../domain/executive-contract';
import type { ExecutiveViewModel } from '../domain/executive-types';
import { buildExecutiveViewModel } from '../domain/executive-view-model';
import { ExecutiveDashboard } from './ExecutiveDashboard';

const REQUIRED_CAPABILITY = 'navigation.grh-executive';
const EXECUTIVE_NAVIGATION: readonly TopbarLink[] = Object.freeze([
  { href: '/inicio.html', label: 'Inicio' },
  { href: '/ejecutivo', label: 'Resumen ejecutivo GRH', current: true },
  { href: '/calidad', label: 'Calidad de datos' },
]);

async function loadExecutiveViewModel(signal: AbortSignal): Promise<ExecutiveViewModel> {
  const contract = await fetchExecutiveContract({ timeoutMs: AUTH_TIMEOUT_MS, signal });
  return buildExecutiveViewModel(contract);
}

export function ExecutiveApp() {
  const { retry, state } = useGovernedSurface({
    loadViewModel: loadExecutiveViewModel,
    requiredCapability: REQUIRED_CAPABILITY,
  });

  return (
    <AppShell
      identity={state.identity}
      links={EXECUTIVE_NAVIGATION}
      busy={state.status === 'loading'}
    >
      {state.status === 'loading' ? (
        <GovernedLoading
          title="Validando tablero ejecutivo"
          description="Confirmamos la sesión, el municipio, la capacidad ejecutiva y el contrato de datos antes de presentar indicadores."
        />
      ) : null}
      {state.status === 'blocked' ? (
        <GovernedBlocked
          title="Evidencia bloqueada"
          description="La evidencia privada no está disponible o no supera su contrato. No se muestra ninguna cifra."
          onRetry={retry}
        />
      ) : null}
      {state.status === 'ready' ? <ExecutiveDashboard viewModel={state.viewModel} /> : null}
    </AppShell>
  );
}
