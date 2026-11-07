import test from 'node:test';
import assert from 'node:assert/strict';
import { reportingPeriod, summarizeBusiness, type BusinessLoan, type BusinessContribution, type BusinessInstallment, type BusinessReceipt } from '../src/business-analytics.ts';

const loans: BusinessLoan[] = [
  { id: 'solo', type: 'SOLO_SELF_MANAGED', agreement_date: '2026-11-02', face_paise: 100000000, net_paise: 90000000, interest_paise: 10000000, funded: 1 },
  { id: 'joint', type: 'JOINT_SELF_MANAGED', agreement_date: '2026-11-03', face_paise: 100000000, net_paise: 90000000, interest_paise: 10000000, funded: 1 },
  { id: 'external', type: 'EXTERNAL', agreement_date: '2026-11-04', face_paise: 200000000, net_paise: 180000000, interest_paise: 20000000, funded: 1 },
  { id: 'old', type: 'SOLO_SELF_MANAGED', agreement_date: '2026-10-28', face_paise: 50000000, net_paise: 45000000, interest_paise: 5000000, funded: 1 }
];
const contributions: BusinessContribution[] = [
  { account_id: 'solo', party_id: 'ayyappan', party_name: 'Ayyappan', net_paise: 90000000, profit_paise: 10000000 },
  { account_id: 'joint', party_id: 'ayyappan', party_name: 'Ayyappan', net_paise: 45000000, profit_paise: 5000000 },
  { account_id: 'joint', party_id: 'ganesh', party_name: 'Ganesh', net_paise: 45000000, profit_paise: 5000000 },
  { account_id: 'external', party_id: 'ayyappan', party_name: 'Ayyappan', net_paise: 180000000, profit_paise: 20000000 }
];
const installments: BusinessInstallment[] = [
  { id: 'solo-dec', account_id: 'solo', due_date: '2026-12-05', amount_paise: 50000000 },
  { id: 'solo-jan', account_id: 'solo', due_date: '2027-01-05', amount_paise: 50000000 },
  { id: 'joint-nov', account_id: 'joint', due_date: '2026-11-05', amount_paise: 100000000 },
  { id: 'external-nov', account_id: 'external', due_date: '2026-11-05', amount_paise: 200000000 }
];
const paid: BusinessReceipt[] = [
  { id: 'paid-joint', installment_id: 'joint-nov', received_date: '2026-11-06', amount_paise: 100000000 },
  { id: 'paid-external', installment_id: 'external-nov', received_date: '2026-11-06', amount_paise: 200000000 }
];

test('managed cohort cards and partner totals exclude external loans and count joint loans once', () => {
  const result = summarizeBusiness(reportingPeriod('current', '2026-11-07'), '2026-11-07', loans, contributions, installments, paid);
  assert.deepEqual(result.totals, { count: 2, net: 180000000, profit: 20000000, face: 200000000 });
  assert.equal(result.monthly.find(row => row.month === '2026-11')?.count, 2);
  assert.deepEqual(result.partners.map(row => [row.name, row.loans, row.net, row.profit, row.share]), [
    ['Ayyappan', 2, 135000000, 15000000, 75],
    ['Ganesh', 1, 45000000, 5000000, 25]
  ]);
  assert.equal(result.partners.reduce((sum, row) => sum + row.net, 0), result.totals.net);
  assert.equal(result.partners.reduce((sum, row) => sum + row.profit, 0), result.totals.profit);
});

test('forecast follows due and receipt months without treating scheduled or bounced items as paid', () => {
  const period = reportingPeriod('current', '2026-11-07');
  const confirmed = summarizeBusiness(period, '2026-11-07', loans, contributions, installments, paid);
  assert.equal(confirmed.totals.profit, 20000000);
  assert.deepEqual(confirmed.forecastTotals, { realized: 10000000, atRisk: 0, future: 10000000 });
  assert.equal(confirmed.forecast.find(row => row.month === '2026-11')?.realized, 10000000);
  assert.equal(confirmed.forecast.find(row => row.month === '2026-12')?.scheduled, 5000000);
  assert.equal(confirmed.forecast.find(row => row.month === '2027-01')?.scheduled, 5000000);
  const bounced = summarizeBusiness(period, '2026-11-07', loans, contributions, installments, []);
  assert.deepEqual(bounced.forecastTotals, { realized: 0, atRisk: 10000000, future: 10000000 });
});

test('custom range is inclusive, changes cohort metrics, and empty periods show zero', () => {
  const selected = summarizeBusiness(reportingPeriod('custom', '2026-11-07', '2026-11-03', '2026-11-04'), '2026-11-07', loans, contributions, installments, paid);
  assert.deepEqual(selected.totals, { count: 1, net: 90000000, profit: 10000000, face: 100000000 });
  assert.equal(selected.monthly.find(row => row.month === '2026-11')?.count, 1);
  assert.equal(selected.partners.length, 2);
  const empty = summarizeBusiness(reportingPeriod('custom', '2026-11-07', '2026-09-01', '2026-09-30'), '2026-11-07', loans, contributions, installments, paid);
  assert.deepEqual(empty.totals, { count: 0, net: 0, profit: 0, face: 0 });
  assert.equal(empty.partners.length, 0);
  assert.equal(empty.monthly[0]?.count, 0);
  assert.equal(empty.forecast.length, 0);
});

test('unfunded agreements count as loans but not invested capital', () => {
  const unsettled = loans.map(row => row.id === 'joint' ? { ...row, funded: 0 } : row);
  const result = summarizeBusiness(reportingPeriod('current', '2026-11-07'), '2026-11-07', unsettled, contributions, installments, paid);
  assert.equal(result.totals.count, 2);
  assert.equal(result.totals.net, 90000000);
  assert.equal(result.totals.profit, 20000000);
  assert.equal(result.partners.find(row => row.name === 'Ganesh')?.net, 0);
  assert.equal(result.partners.find(row => row.name === 'Ganesh')?.profit, 5000000);
});

test('reporting periods use valid inclusive calendar dates', () => {
  assert.deepEqual([reportingPeriod('previous', '2026-11-07').start, reportingPeriod('previous', '2026-11-07').end], ['2026-10-01', '2026-10-31']);
  assert.deepEqual([reportingPeriod('last3', '2026-11-07').start, reportingPeriod('last3', '2026-11-07').end], ['2026-09-01', '2026-11-30']);
  assert.throws(() => reportingPeriod('custom', '2026-11-07', '2026-02-30', '2026-03-01'), /valid start and end/);
  assert.throws(() => reportingPeriod('custom', '2026-11-07', '2026-12-01', '2026-11-01'), /valid start and end/);
});
