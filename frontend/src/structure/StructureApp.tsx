import { AUTH_TIMEOUT_MS } from '../auth/session';
import { useGovernedSurface } from '../auth/use-governed-surface';
import { AppShell } from '../components/AppShell';
import { GovernedBlocked, GovernedLoading } from '../components/GovernedStates';
import type { TopbarLink } from '../components/Topbar';
import { fetchOrganizationAnalyticsContract } from '../domain/organization-analytics-contract';
import type { OrganizationAnalyticsViewModel } from '../domain/organization-analytics-types';
import { buildOrganizationAnalyticsViewModel } from '../domain/organization-analytics-view-model';
import { StructureDashboard } from './StructureDashboard';

const REQUIRED_CAPABILITY = 'navigation.organization-analytics';
const STRUCTURE_NAVIGATION: readonly TopbarLink[] = Object.freeze([
  { href: '/inicio.html', label: 'Inicio' },
  { href: '/ejecutivo', label: 'Resumen GRH' },
  { href: '/estructura', label: 'Dotación y ausencias', current: true },
  { href: '/calidad', label: 'Calidad' },
]);

async function loadStructureViewModel(signal: AbortSignal): Promise<OrganizationAnalyticsViewModel> {
  const contract = await fetchOrganizationAnalyticsContract({ timeoutMs: AUTH_TIMEOUT_MS, signal });
  return buildOrganizationAnalyticsViewModel(contract);
}

export function StructureApp() {
  const { retry, state } = useGovernedSurface({
    loadViewModel: loadStructureViewModel,
    requiredCapability: REQUIRED_CAPABILITY,
  });

  return (
    <AppShell
      identity={state.identity}
      links={STRUCTURE_NAVIGATION}
      busy={state.status === 'loading'}
    >
      {state.status === 'loading' ? (
        <GovernedLoading
          title="Validando sala de situación"
          description="Confirmamos sesión, capacidad y contrato GRH antes de mostrar indicadores."
        />
      ) : null}
      {state.status === 'blocked' ? (
        <GovernedBlocked
          title="Sala de situación bloqueada"
          description="La evidencia privada no está disponible o no supera el contrato. No se muestra ninguna cifra."
          onRetry={retry}
        />
      ) : null}
      {state.status === 'ready' ? (
        <StructureDashboard
          capabilities={state.identity.capabilities}
          viewModel={state.viewModel}
        />
      ) : null}
    </AppShell>
  );
}
