import { test } from 'node:test';
import assert from 'node:assert/strict';
import { calculateLoan, contributions } from '../src/domain/money.ts';
import { scheduleDates, scheduleByCount } from '../src/domain/schedule.ts';

test('pool allocation remains within recorded scope', () => {
  const pool = calculateLoan(50000000n,17n,1n,'half-up');
  const shares = contributions(pool,'FACE_SHARE',[{id:'owner',amount:25000000n},{id:'partner',amount:25000000n}]);
  assert.deepEqual(shares.map(s => [s.face,s.netCash,s.expectedProfit]), [[25000000n,20750000n,4250000n],[25000000n,20750000n,4250000n]]);
});
test('rounding policy must be explicit and changes half-paise outcomes', () => {
  assert.equal(calculateLoan(1n,50n,1n,'half-up').interest,1n);
  assert.equal(calculateLoan(1n,50n,1n,'half-even').interest,0n);
  assert.throws(() => calculateLoan(1n,50n,1n,undefined as never));
  assert.throws(() => calculateLoan(100n,100n,1n,'half-up'));
});
test('date alignment and small installment limits', () => {
  assert.deepEqual(scheduleDates('2026-11-09',2,7,5),['2026-11-13','2026-11-20']);
  assert.throws(() => scheduleByCount(2n,3));
});
