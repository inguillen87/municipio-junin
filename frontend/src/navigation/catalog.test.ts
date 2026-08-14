import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';

import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  contextualLinks,
  getNavigationDefinition,
  projectNavigation,
} from './catalog';

const CATALOG_SOURCE = readFileSync(
  new URL('../../../js/navigation-catalog.js', import.meta.url),
  'utf8',
);

function browserDefinition(): unknown {
  const scope: { MuniNavigationDefinition?: unknown } = {};
  runInNewContext(CATALOG_SOURCE, { window: scope });
  return scope.MuniNavigationDefinition;
}

function installWindow(definition: unknown, pathname = '/estructura') {
  vi.stubGlobal('window', {
    location: {
      origin: 'https://municipio.test',
      pathname,
    },
    MuniNavigationDefinition: definition,
  });
}

function deepFreeze(value: unknown): unknown {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  for (const child of Object.values(value)) deepFreeze(child);
  return Object.freeze(value);
}

afterEach(() => vi.unstubAllGlobals());

describe('React navigation catalog adapter', () => {
  it('parses the browser definition into one deeply immutable contract', () => {
    installWindow(browserDefinition());
    const definition = getNavigationDefinition();
    expect(definition).not.toBeNull();
    expect(definition?.version).toBe('2026-08-14.4');
    expect(definition?.groups.map(group => group.id)).toEqual([
      'executive', 'people', 'territory', 'data',
    ]);
    expect(definition?.items).toHaveLength(22);
    expect(Object.isFrozen(definition)).toBe(true);
    expect(Object.isFrozen(definition?.groups)).toBe(true);
    expect(Object.isFrozen(definition?.items)).toBe(true);
    expect(definition?.groups.every(Object.isFrozen)).toBe(true);
    expect(definition?.items.every(Object.isFrozen)).toBe(true);
  });

  it('projects only capability-authorized groups and preserves secondary destinations', () => {
    installWindow(browserDefinition());
    const definition = getNavigationDefinition();
    expect(definition).not.toBeNull();
    if (!definition) return;
    const projection = projectNavigation(definition, [
      'navigation.workspace',
      'navigation.employment-actions',
      'navigation.organization-analytics',
      'navigation.rrhh',
      'navigation.help',
    ], '/estructura');
    expect(projection.top.map(item => item.id)).toEqual(['workspace']);
    expect(projection.footer.map(item => item.id)).toEqual(['manuales']);
    expect(projection.groups.map(group => group.id)).toEqual(['people', 'territory']);
    expect(projection.groups.find(group => group.id === 'people')?.items.map(item => item.id)).toEqual([
      'estructura', 'trayectoria', 'movimientos-grh', 'rrhh', 'areas-grh',
    ]);
    expect(projection.groups.find(group => group.id === 'territory')?.items.map(item => item.id)).toEqual([
      'cuentas', 'ciudadano',
    ]);
    expect(projection.activeItemId).toBe('estructura');
    expect(projection.activeGroupId).toBe('people');
    expect(Object.isFrozen(projection)).toBe(true);
    expect(Object.isFrozen(projection.groups)).toBe(true);
  });

  it('keeps low-role navigation in the territorial group without ambient executive links', () => {
    installWindow(browserDefinition(), '/territorio');
    const definition = getNavigationDefinition();
    expect(definition).not.toBeNull();
    if (!definition) return;
    const projection = projectNavigation(definition, [
      'navigation.workspace', 'navigation.territory', 'navigation.help',
    ], '/territorio');
    expect(projection.groups.map(group => group.id)).toEqual(['territory']);
    expect(projection.groups[0]?.items.map(item => item.id)).toEqual([
      'territorio', 'cuentas', 'ciudadano',
    ]);
    expect(projection.activeItemId).toBe('territorio');
    expect(projection.groups.flatMap(group => group.items).some(item => item.id === 'estructura')).toBe(false);
  });

  it('derives contextual room links from the same capability projection', () => {
    installWindow(browserDefinition());
    const definition = getNavigationDefinition();
    const links = contextualLinks(
      ['grh-ejecutivo', 'estructura', 'control'],
      definition,
      { capabilities: ['navigation.workspace', 'navigation.organization-analytics'] },
      'estructura',
    );
    expect(links).toEqual([{ href: '/estructura', label: 'Estructura', current: true }]);
    expect(Object.isFrozen(links)).toBe(true);
    expect(contextualLinks(['estructura'], null, null, 'estructura')).toEqual([]);
  });

  it('normalizes mutable input and fails closed on unsafe, duplicate and unknown access contracts', () => {
    const source = browserDefinition() as { items: Array<Record<string, unknown>> };
    const mutable = structuredClone(source);
    installWindow(mutable);
    const parsed = getNavigationDefinition();
    expect(parsed).not.toBeNull();
    expect(Object.isFrozen(parsed)).toBe(true);
    expect(Object.isFrozen(parsed?.items)).toBe(true);
    expect(Object.isFrozen(mutable)).toBe(false);

    const unsafe = structuredClone(source);
    unsafe.items[1]!.href = 'https://outside.test/dashboard';
    installWindow(deepFreeze(unsafe));
    expect(getNavigationDefinition()).toBeNull();

    const duplicate = structuredClone(source);
    duplicate.items[1]!.href = duplicate.items[0]!.href;
    installWindow(deepFreeze(duplicate));
    expect(getNavigationDefinition()).toBeNull();

    const unknown = structuredClone(source);
    unknown.items[1]!.capability = 'navigation.future';
    installWindow(deepFreeze(unknown));
    expect(getNavigationDefinition()).toBeNull();

    const extraKey = structuredClone(source);
    extraKey.items[1]!.description = 'parallel copy';
    installWindow(deepFreeze(extraKey));
    expect(getNavigationDefinition()).toBeNull();

    const wrongOrder = structuredClone(source);
    [wrongOrder.items[1], wrongOrder.items[2]] = [wrongOrder.items[2]!, wrongOrder.items[1]!];
    installWindow(deepFreeze(wrongOrder));
    expect(getNavigationDefinition()).toBeNull();

    const invalidPublic = structuredClone(source);
    const publicItem = invalidPublic.items.find(item => item.id === 'cuentas');
    if (publicItem) publicItem.public = false;
    installWindow(deepFreeze(invalidPublic));
    expect(getNavigationDefinition()).toBeNull();

    const duplicatePrimary = structuredClone(source);
    const secondaryHacienda = duplicatePrimary.items.find(item => item.id === 'corridas-grh');
    if (secondaryHacienda) secondaryHacienda.primary = true;
    installWindow(deepFreeze(duplicatePrimary));
    expect(getNavigationDefinition()).toBeNull();
  });
});
