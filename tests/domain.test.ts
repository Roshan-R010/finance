import { test } from 'node:test';
import assert from 'node:assert/strict';
import { calculateLoan, contributions, allocate } from '../src/domain/money.ts';
import { manualSchedule, scheduleByCount, scheduleByAmount, scheduleDates } from '../src/domain/schedule.ts';

test('upfront discount and scope examples', () => {
  assert.deepEqual(calculateLoan  (100000000n, 10n, 1n, 'half-up'), { face: 100000000n, interest: 10000000n, netCash: 90000000n, expectedGrossProfit: 10000000n });
  assert.equal(calculateLoan(50000000n, 17n, 1n, 'half-up').netCash, 41500000n);
  assert.equal(calculateLoan(25000000n, 17n, 1n, 'half-up').interest, 4250000n);
});
test('contribution bases reconcile exactly', () => {
  const loan = calculateLoan(100000000n, 10n, 1n, 'half-up');
  assert.deepEqual(contributions(loan, 'FACE_SHARE', [{id:'partner',amount:30000000n},{id:'owner',amount:70000000n}]).map(x=>x.netCash), [27000000n,63000000n]);
  const cash = contributions(loan, 'NET_CASH', [{id:'partner',amount:30000000n},{id:'owner',amount:60000000n}]);
  assert.equal(cash[1].netCash, 60000000n);
  assert.equal(cash.reduce((a,x)=>a+x.face,0n), loan.face);
  assert.deepEqual(allocate(2n,[{id:'b',weight:1n},{id:'a',weight:1n},{id:'c',weight:1n}]).map(x=>x.amount),[1n,1n,0n]);
  assert.throws(() => contributions(loan,'FACE_SHARE',[{id:'x',amount:1n}]));
});
test('schedule totals and date-only recurrence', () => {
  assert.equal(manualSchedule(100000000n,[{amount:10000000n,count:9},{amount:5000000n,count:2}]).length,11);
  assert.throws(() => manualSchedule(100000000n,[{amount:10000000n,count:11}]));
  assert.deepEqual(scheduleByCount(100000000n,12).slice(-2),[8333333n,8333337n]);
  assert.deepEqual(scheduleByAmount(10n,4n),[4n,4n,2n]);
  assert.deepEqual(scheduleDates('2026-11-13',3,7,5),['2026-11-13','2026-11-20','2026-11-27']);
  assert.deepEqual(scheduleDates('2026-11-13',3,10),['2026-11-13','2026-11-23','2026-12-03']);
  assert.throws(() => scheduleDates('2026-02-30',1,7));
});
