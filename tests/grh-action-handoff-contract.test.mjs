import assert from 'node:assert/strict';
import test from 'node:test';

import {
  GRH_ACTION_HANDOFF_CONTRACT,
  GRH_ACTION_HANDOFF_QUERY_KEY,
  resolveFirstGrhActionHandoff,
  resolveGrhActionHandoff,
} from '../api/lib/grh-action-handoff-contract.js';

test('handoff freezes the exact focus deep link for a current actionable priority', () => {
  assert.deepEqual(resolveGrhActionHandoff({
    currentPriorityCodes: [
      'cross_source_material_difference',
      'temporal_quarantine_present',
      'historical_snapshot',
    ],
    priorityCode: 'temporal_quarantine_present',
  }), {
    contract: GRH_ACTION_HANDOFF_CONTRACT,
    queryKey: GRH_ACTION_HANDOFF_QUERY_KEY,
    priorityCode: 'temporal_quarantine_present',
    href: '/decisiones-grh?focus=temporal_quarantine_present',
  });
});

test('handoff fails closed for stale, unknown, malformed or widened input', () => {
  const rejected = [
    null,
    {},
    { currentPriorityCodes: [], priorityCode: 'temporal_quarantine_present' },
    { currentPriorityCodes: ['historical_snapshot'], priorityCode: 'temporal_quarantine_present' },
    { currentPriorityCodes: ['made_up_priority'], priorityCode: 'made_up_priority' },
    { currentPriorityCodes: ['temporal_quarantine_present'], priorityCode: '../temporal_quarantine_present' },
    {
      currentPriorityCodes: ['temporal_quarantine_present'],
      priorityCode: 'temporal_quarantine_present',
      href: '/decisiones-grh?focus=temporal_quarantine_present',
    },
    {
      currentPriorityCodes: ['temporal_quarantine_present', 'temporal_quarantine_present'],
      priorityCode: 'temporal_quarantine_present',
    },
  ];
  rejected.forEach(input => assert.equal(resolveGrhActionHandoff(input), null));
});

test('first handoff follows brief order and skips non-actionable context', () => {
  assert.equal(resolveFirstGrhActionHandoff(['historical_snapshot']), null);
  assert.deepEqual(
    resolveFirstGrhActionHandoff([
      'historical_snapshot',
      'temporal_quarantine_present',
      'cross_source_material_difference',
    ]),
    {
      contract: GRH_ACTION_HANDOFF_CONTRACT,
      queryKey: GRH_ACTION_HANDOFF_QUERY_KEY,
      priorityCode: 'temporal_quarantine_present',
      href: '/decisiones-grh?focus=temporal_quarantine_present',
    },
  );
});
