import { isKnownNavigationCapability, type SessionIdentity } from '../auth/session';

const NAVIGATION_DEFINITION_VERSION = '2026-08-14.6';
const GROUP_IDS = Object.freeze(['executive', 'people', 'territory', 'data'] as const);
const PLACEMENTS = Object.freeze(['top', 'group', 'footer'] as const);
const EXPECTED_ITEM_COUNT = 23;
const PUBLIC_IDS = Object.freeze(['cuentas', 'ciudadano'] as const);
const SECONDARY_BY_CAPABILITY = Object.freeze({
  'navigation.dashboard': Object.freeze(['gestiones']),
  'navigation.hacienda': Object.freeze(['corridas-grh', 'conceptos-fijos']),
  'navigation.organization-analytics': Object.freeze(['movimientos-grh']),
  'navigation.rrhh': Object.freeze(['areas-grh']),
} as const);
const EXPECTED_ITEMS = Object.freeze([
  ['workspace', null, 'top', 'navigation.workspace', true],
  ['dashboard', 'executive', 'group', 'navigation.dashboard', true],
  ['gestiones', 'executive', 'group', 'navigation.dashboard', false],
  ['grh-ejecutivo', 'executive', 'group', 'navigation.grh-executive', true],
  ['decisiones-grh', 'executive', 'group', 'navigation.grh-decisions', true],
  ['ia', 'executive', 'group', 'navigation.ai-assistant', true],
  ['reportes', 'executive', 'group', 'navigation.reports', true],
  ['hacienda', 'people', 'group', 'navigation.hacienda', true],
  ['corridas-grh', 'people', 'group', 'navigation.hacienda', false],
  ['conceptos-fijos', 'people', 'group', 'navigation.hacienda', false],
  ['estructura', 'people', 'group', 'navigation.organization-analytics', true],
  ['trayectoria', 'people', 'group', 'navigation.employment-actions', true],
  ['movimientos-grh', 'people', 'group', 'navigation.organization-analytics', false],
  ['rrhh', 'people', 'group', 'navigation.rrhh', true],
  ['areas-grh', 'people', 'group', 'navigation.rrhh', false],
  ['territorio', 'territory', 'group', 'navigation.territory', true],
  ['cuentas', 'territory', 'group', 'public', false],
  ['ciudadano', 'territory', 'group', 'public', false],
  ['importar', 'data', 'group', 'navigation.import', true],
  ['auditoria', 'data', 'group', 'navigation.audit', true],
  ['control', 'data', 'group', 'navigation.data-quality', true],
  ['exportar', 'data', 'group', 'navigation.export', true],
  ['manuales', null, 'footer', 'navigation.help', true],
] as const);

type NavigationGroupId = (typeof GROUP_IDS)[number];
type NavigationPlacement = (typeof PLACEMENTS)[number];

export interface NavigationGroup {
  id: NavigationGroupId;
  label: string;
  shortLabel: string;
  icon: string;
}

export interface NavigationItem {
  id: string;
  href: string;
  label: string;
  shortLabel: string;
  icon: string;
  groupId: NavigationGroupId | null;
  placement: NavigationPlacement;
  capability?: string;
  public?: true;
  primary: boolean;
}

export interface NavigationDefinition {
  version: typeof NAVIGATION_DEFINITION_VERSION;
  groups: readonly NavigationGroup[];
  items: readonly NavigationItem[];
}

export interface ProjectedNavigationGroup extends NavigationGroup {
  items: readonly NavigationItem[];
}

export interface NavigationProjection {
  groups: readonly ProjectedNavigationGroup[];
  top: readonly NavigationItem[];
  footer: readonly NavigationItem[];
  activeItemId: string | null;
  activeGroupId: NavigationGroupId | null;
}

export interface ContextualNavigationLink {
  current?: true;
  href: string;
  label: string;
}

function plainObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function hasExactKeys(value: Record<string, unknown>, expected: readonly string[]): boolean {
  const actual = Object.keys(value).sort();
  const wanted = [...expected].sort();
  return actual.length === wanted.length && actual.every((key, index) => key === wanted[index]);
}

function nonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim() === value && value.length > 0;
}

function validInternalHref(value: unknown): value is string {
  if (!nonEmptyString(value) || value.includes('\\') || value.startsWith('//')) return false;
  try {
    const url = new URL(value, window.location.origin);
    return url.origin === window.location.origin && url.username === '' && url.password === '';
  } catch {
    return false;
  }
}

function isGroupId(value: unknown): value is NavigationGroupId {
  return typeof value === 'string' && (GROUP_IDS as readonly string[]).includes(value);
}

function isPlacement(value: unknown): value is NavigationPlacement {
  return typeof value === 'string' && (PLACEMENTS as readonly string[]).includes(value);
}

function parseGroup(value: unknown, expectedId: NavigationGroupId): NavigationGroup | null {
  if (!plainObject(value) || !hasExactKeys(value, ['id', 'label', 'shortLabel', 'icon']) ||
      value.id !== expectedId || !nonEmptyString(value.label) ||
      !nonEmptyString(value.shortLabel) || !nonEmptyString(value.icon)) {
    return null;
  }
  return Object.freeze({
    id: expectedId,
    label: value.label,
    shortLabel: value.shortLabel,
    icon: value.icon,
  });
}

function parseItem(value: unknown, knownIds: Set<string>): NavigationItem | null {
  if (!plainObject(value)) return null;
  const hasCapability = Object.hasOwn(value, 'capability');
  const hasPublic = Object.hasOwn(value, 'public');
  const expectedKeys = [
    'id', 'href', 'label', 'shortLabel', 'icon', 'groupId', 'placement', 'primary',
    hasCapability ? 'capability' : 'public',
  ];
  if (hasCapability === hasPublic || !hasExactKeys(value, expectedKeys) ||
      !nonEmptyString(value.id) || knownIds.has(value.id) || !validInternalHref(value.href) ||
      !nonEmptyString(value.label) || !nonEmptyString(value.shortLabel) ||
      !nonEmptyString(value.icon) || !isPlacement(value.placement) ||
      typeof value.primary !== 'boolean') {
    return null;
  }
  if ((hasCapability && (!nonEmptyString(value.capability) ||
                         !isKnownNavigationCapability(value.capability))) ||
      (hasPublic && value.public !== true)) {
    return null;
  }
  const groupId = value.groupId;
  if (value.placement === 'group') {
    if (!isGroupId(groupId)) return null;
  } else if (groupId !== null) {
    return null;
  }
  if (value.placement === 'top' && value.id !== 'workspace') return null;
  if (value.placement === 'footer' && value.id !== 'manuales') return null;

  knownIds.add(value.id);
  return Object.freeze({
    id: value.id,
    href: normalizeHref(value.href),
    label: value.label,
    shortLabel: value.shortLabel,
    icon: value.icon,
    groupId,
    placement: value.placement,
    ...(hasCapability ? { capability: value.capability as string } : { public: true as const }),
    primary: value.primary,
  });
}

function parseDefinition(value: unknown): NavigationDefinition | null {
  if (!plainObject(value) || !hasExactKeys(value, ['version', 'groups', 'items']) ||
      value.version !== NAVIGATION_DEFINITION_VERSION || !Array.isArray(value.groups) ||
      value.groups.length !== GROUP_IDS.length || !Array.isArray(value.items) ||
      value.items.length !== EXPECTED_ITEM_COUNT) {
    return null;
  }
  const groups: NavigationGroup[] = [];
  for (let index = 0; index < GROUP_IDS.length; index += 1) {
    const expectedId = GROUP_IDS[index];
    if (!expectedId) return null;
    const group = parseGroup(value.groups[index], expectedId);
    if (!group) return null;
    groups.push(group);
  }
  const knownIds = new Set<string>();
  const knownHrefs = new Set<string>();
  const items: NavigationItem[] = [];
  for (const candidate of value.items) {
    const item = parseItem(candidate, knownIds);
    if (!item) return null;
    if (knownHrefs.has(item.href)) return null;
    knownHrefs.add(item.href);
    items.push(item);
  }
  const contractMismatch = items.some((item, index) => {
    const expected = EXPECTED_ITEMS[index];
    if (!expected) return true;
    const [id, groupId, placement, access, primary] = expected;
    return item.id !== id || item.groupId !== groupId || item.placement !== placement ||
      item.primary !== primary || (access === 'public' ? item.public !== true : item.capability !== access);
  });
  const workspace = items.filter(item => item.id === 'workspace' && item.placement === 'top');
  const help = items.filter(item => item.id === 'manuales' && item.placement === 'footer');
  const publicIds = items.filter(item => item.public === true).map(item => item.id);
  const capabilityItems = items.filter(
    (item): item is NavigationItem & { capability: string } => typeof item.capability === 'string',
  );
  const capabilityGroups = new Map<string, Array<NavigationItem & { capability: string }>>();
  for (const item of capabilityItems) {
    const scopedItems = capabilityGroups.get(item.capability) ?? [];
    scopedItems.push(item);
    capabilityGroups.set(item.capability, scopedItems);
  }
  const invalidCapabilityGroup = [...capabilityGroups].some(([capability, scopedItems]) => {
    const primaryItems = scopedItems.filter(item => item.primary);
    const secondaryItems = scopedItems.filter(item => !item.primary);
    const expectedSecondary = SECONDARY_BY_CAPABILITY[
      capability as keyof typeof SECONDARY_BY_CAPABILITY
    ];
    return primaryItems.length !== 1 || scopedItems[0]?.primary !== true ||
      secondaryItems.length !== (expectedSecondary?.length ?? 0) ||
      (expectedSecondary ? secondaryItems.some((item, index) => item.id !== expectedSecondary[index]) : false);
  });
  if (workspace.length !== 1 || help.length !== 1 || contractMismatch || invalidCapabilityGroup ||
      publicIds.length !== PUBLIC_IDS.length ||
      publicIds.some((id, index) => id !== PUBLIC_IDS[index]) ||
      groups.some(group => !items.some(item => item.groupId === group.id))) {
    return null;
  }
  return Object.freeze({
    version: NAVIGATION_DEFINITION_VERSION,
    groups: Object.freeze(groups),
    items: Object.freeze(items),
  });
}

export function normalizeHref(href: string): string {
  const url = new URL(href, window.location.origin);
  return `${url.pathname.startsWith('/') ? '' : '/'}${url.pathname}${url.search}${url.hash}`;
}

function comparablePath(path: string): string {
  let normalized = path.split(/[?#]/u, 1)[0] ?? '/';
  if (!normalized.startsWith('/')) normalized = `/${normalized}`;
  normalized = normalized.replace(/\/(?:index)?\.html$/u, '/').replace(/\.html$/u, '');
  return normalized.length > 1 ? normalized.replace(/\/$/u, '') : normalized;
}

export function isActiveNavigationHref(href: string, pathname = window.location.pathname): boolean {
  return comparablePath(new URL(href, window.location.origin).pathname) === comparablePath(pathname);
}

export function getNavigationDefinition(): NavigationDefinition | null {
  return parseDefinition(window.MuniNavigationDefinition);
}

function canAccess(item: NavigationItem, capabilities: ReadonlySet<string>): boolean {
  return item.public === true || (typeof item.capability === 'string' && capabilities.has(item.capability));
}

export function projectNavigation(
  definition: NavigationDefinition,
  capabilities: readonly string[],
  pathname = window.location.pathname,
): NavigationProjection {
  const allowed = new Set(capabilities);
  const items = definition.items.filter(item => canAccess(item, allowed));
  const activeItem = items.find(item => isActiveNavigationHref(item.href, pathname)) ?? null;
  const groups = definition.groups.flatMap(group => {
    const groupItems = items.filter(item => item.placement === 'group' && item.groupId === group.id);
    return groupItems.length > 0 ? [{ ...group, items: Object.freeze(groupItems) }] : [];
  });
  return Object.freeze({
    groups: Object.freeze(groups),
    top: Object.freeze(items.filter(item => item.placement === 'top')),
    footer: Object.freeze(items.filter(item => item.placement === 'footer')),
    activeItemId: activeItem?.id ?? null,
    activeGroupId: activeItem?.groupId ?? null,
  });
}

export function contextualLinks(
  itemIds: readonly string[],
  definition: NavigationDefinition | null,
  identity: Pick<SessionIdentity, 'capabilities'> | null,
  activeItemId: string,
): readonly ContextualNavigationLink[] {
  if (!definition || !identity) return Object.freeze([]);
  const projection = projectNavigation(definition, identity.capabilities);
  const accessibleItems = [...projection.top, ...projection.groups.flatMap(group => group.items), ...projection.footer];
  const byId = new Map(accessibleItems.map(item => [item.id, item]));
  return Object.freeze(itemIds.flatMap(id => {
    const item = byId.get(id);
    if (!item) return [];
    return [{
      href: item.href,
      label: item.shortLabel,
      ...(item.id === activeItemId ? { current: true as const } : {}),
    }];
  }));
}
