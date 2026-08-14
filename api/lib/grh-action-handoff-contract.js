import {
  GRH_ACTION_LEDGER_ACTION_DEFINITIONS,
} from './grh-action-ledger-contract.js';

export const GRH_ACTION_HANDOFF_CONTRACT = 'grh-action-handoff-v1';
export const GRH_ACTION_HANDOFF_QUERY_KEY = 'focus';

const PRIORITY_CODE = /^[a-z][a-z0-9_]{1,63}$/;
const ACTIONABLE_PRIORITY_CODES = Object.freeze(
  GRH_ACTION_LEDGER_ACTION_DEFINITIONS.map(definition => definition.priorityCode),
);
const ACTIONABLE_PRIORITY_SET = new Set(ACTIONABLE_PRIORITY_CODES);

function plainObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value) &&
    Object.getPrototypeOf(value) === Object.prototype;
}

function exactKeys(value, expected) {
  if (!plainObject(value)) return false;
  const actual = Object.keys(value).sort();
  const canonical = [...expected].sort();
  return actual.length === canonical.length &&
    actual.every((key, index) => key === canonical[index]);
}

function validCurrentPriorityCodes(value) {
  return Array.isArray(value) && value.length <= ACTIONABLE_PRIORITY_CODES.length + 1 &&
    value.every(code => typeof code === 'string' && PRIORITY_CODE.test(code)) &&
    new Set(value).size === value.length;
}

export function resolveGrhActionHandoff(input) {
  if (!exactKeys(input, ['currentPriorityCodes', 'priorityCode']) ||
      typeof input.priorityCode !== 'string' || !PRIORITY_CODE.test(input.priorityCode) ||
      !ACTIONABLE_PRIORITY_SET.has(input.priorityCode) ||
      !validCurrentPriorityCodes(input.currentPriorityCodes) ||
      !input.currentPriorityCodes.includes(input.priorityCode)) {
    return null;
  }

  return Object.freeze({
    contract: GRH_ACTION_HANDOFF_CONTRACT,
    queryKey: GRH_ACTION_HANDOFF_QUERY_KEY,
    priorityCode: input.priorityCode,
    href: `/decisiones-grh?${GRH_ACTION_HANDOFF_QUERY_KEY}=${input.priorityCode}`,
  });
}

export function resolveFirstGrhActionHandoff(currentPriorityCodes) {
  if (!validCurrentPriorityCodes(currentPriorityCodes)) return null;
  const priorityCode = currentPriorityCodes.find(code => ACTIONABLE_PRIORITY_SET.has(code));
  return priorityCode
    ? resolveGrhActionHandoff({ currentPriorityCodes, priorityCode })
    : null;
}
