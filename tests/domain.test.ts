import { test } from 'node:test';
import assert from 'node:assert/strict';
import { calculateLoan, contributions, allocate } from '../src/domain/money.ts';
import { manualSchedule, scheduleByCount, scheduleByAmount, scheduleDates } from '../src/domain/schedule.ts';

test('server schedule validates custom amounts and edited totals', async () => {
  process.env.DATABASE_URL ||= 'postgresql://user:pass@localhost:5432/test';
  const { scheduleInput } = await import('../src/service.prisma.ts');
  const schedule = { mode:'MANUAL', groups:[{amount:'50000',count:5},{amount:'150000',count:1}], firstDate:'2026-11-06', intervalDays:7 };
  const rows = scheduleInput({schedule},40000000n,true);
  assert.equal(rows.length,6);
  assert.equal(rows.reduce((n,r)=>n+r.amount,0),40000000);
  assert.throws(()=>scheduleInput({schedule:{...schedule,groups:[{amount:'50000',count:5}]}},40000000n,true),(err:any)=>err.status===422);
  assert.throws(()=>scheduleInput({schedule:{...schedule,overrides:[{index:0,amount:'1'}]}},40000000n,true),(err:any)=>err.status===422);
});

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
test('equal investors split actual net capital and expected interest', () => {
  for (const [face,rate,net,interest] of [
    [100000000n,10n,45000000n,5000000n],
    [50000000n,17n,20750000n,4250000n]
  ] as const) {
    const loan=calculateLoan(face,rate,1n,'half-up');
    const shares=contributions(loan,'FACE_SHARE',[{id:'owner',amount:face/2n},{id:'partner',amount:face/2n}]);
    assert.deepEqual(shares.map(s=>s.netCash),[net,net]);
    assert.deepEqual(shares.map(s=>s.expectedProfit),[interest,interest]);
    assert.equal(shares.reduce((sum,s)=>sum+s.netCash,0n),loan.netCash);
    assert.equal(shares.reduce((sum,s)=>sum+s.expectedProfit,0n),loan.interest);
  }
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
