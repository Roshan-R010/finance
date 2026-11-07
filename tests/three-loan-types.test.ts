import { test } from 'node:test';
import assert from 'node:assert/strict';
import { externalManagerRules, externalManagerRule } from '../src/external-managers.ts';
import { classifyAccount } from '../src/domain/accounts.ts';
import { calculateLoan, contributions } from '../src/domain/money.ts';

test('external workflows are selected by persistent manager ID', () => {
  const [ganesh, trueFinance] = externalManagerRules();
  assert.notEqual(ganesh.id, trueFinance.id);
  assert.equal(externalManagerRule(ganesh.id)?.arrangement, 'OWN_STAKE_EXTERNALLY_MANAGED');
  assert.deepEqual(ganesh.allowedContributorIds, []);
  assert.equal(externalManagerRule(trueFinance.id)?.arrangement, 'MANAGED_POOL');
  assert.deepEqual(trueFinance.allowedContributorIds, [ganesh.id]);
  assert.equal(externalManagerRule('00000000-0000-0000-0000-000000000000'), undefined);
});

test('Ganesh tracks only Ayyappan; True Finance can track Ayyappan alone or with Ganesh', () => {
  const [ganesh, trueFinance] = externalManagerRules();
  const base = { type: 'EXTERNAL' as const, ownerId: 'ayyappan', hasSchedule: false };
  assert.deepEqual(classifyAccount({ ...base, arrangement: ganesh.arrangement, externalManagerId: ganesh.id, contributorIds: ['ayyappan'] }), {
    scope: 'PERSONAL_STAKE_FACE', businessEligible: false, scheduleRequired: false, physicalChequesAllowed: false
  });
  for (const ids of [['ayyappan'], ['ayyappan', ganesh.id]]) {
    const result = classifyAccount({ ...base, arrangement: trueFinance.arrangement, externalManagerId: trueFinance.id, contributorIds: ids });
    assert.equal(result.scope, 'POOL_FACE');
    assert.equal(result.businessEligible, false);
    assert.equal(result.scheduleRequired, false);
  }
  assert.throws(() => classifyAccount({ ...base, arrangement: ganesh.arrangement, externalManagerId: ganesh.id, contributorIds: ['ayyappan', ganesh.id] }));
});

test('five-lakh True Finance pool divides face, net capital and profit in paise', () => {
  const loan = calculateLoan(50_000_000n, 17n, 1n, 'half-up');
  assert.deepEqual(loan, { face: 50_000_000n, interest: 8_500_000n, netCash: 41_500_000n, expectedGrossProfit: 8_500_000n });
  const shares = contributions(loan, 'FACE_SHARE', [{ id: 'ayyappan', amount: 25_000_000n }, { id: 'ganesh', amount: 25_000_000n }]);
  assert.deepEqual(shares, [
    { id: 'ayyappan', face: 25_000_000n, netCash: 20_750_000n, expectedProfit: 4_250_000n },
    { id: 'ganesh', face: 25_000_000n, netCash: 20_750_000n, expectedProfit: 4_250_000n }
  ]);
  assert.deepEqual(contributions(loan, 'NET_CASH', [{ id: 'ayyappan', amount: 20_750_000n }, { id: 'ganesh', amount: 20_750_000n }]), shares);
});
