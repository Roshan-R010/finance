import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { chequeDepositPdf } from '../src/cheque-pdf.ts';

test('cheque PDF groups the selected date range by scheduled date', () => {
  const pdf = chequeDepositPdf({ date: '2026-11-05', endDate: '2026-11-11', rows: [
    { scheduled_date: '2026-11-06', borrower_name: 'Second Day', borrower_phone: '2222222222', amount_paise: 20000000 },
    { scheduled_date: '2026-11-05', borrower_name: 'Test Borrower', borrower_phone: '9876543210', amount_paise: 100000000 },
    { scheduled_date: '2026-11-05', borrower_name: 'Same Day', borrower_phone: '1111111111', amount_paise: 10000000 }
  ], count: 3, amount: 130000000 }).toString('ascii');
  assert.match(pdf, /Scheduled dates: 2026-11-05 to 2026-11-11/);
  assert.match(pdf, /Phone Number/);
  assert.match(pdf, /Test Borrower/);
  assert.match(pdf, /9876543210/);
  assert.ok(pdf.indexOf('5 NOV 26') < pdf.indexOf('Test Borrower'));
  assert.ok(pdf.indexOf('Test Borrower') < pdf.indexOf('Same Day'));
  assert.ok(pdf.indexOf('Same Day') < pdf.indexOf('6 NOV 26'));
  assert.ok(pdf.indexOf('6 NOV 26') < pdf.indexOf('Second Day'));
  assert.doesNotMatch(pdf, /Loan Ref/);
});

test('dashboard cards navigate to cheque views and today has no result actions', async () => {
  const app = { innerHTML: '' };
  const today = '2026-11-05';
  const metrics = {
    today: { count: 1, amount: 10000000 },       // ₹1,00,000 -> ₹1L
    yesterday: { count: 1, amount: 100000000 },   // ₹10,00,000 -> ₹10L
    olderPending: { count: 2, amount: 20000000 }, // ₹2,00,000 -> ₹2L
    bounced: { count: 1, amount: 5000000 },       // ₹50,000 -> ₹0.5L
    followup: { count: 3, amount: 25000000 },     // ₹2,50,000 -> ₹2.5L
    upcoming: { count: 4, amount: 1000000000 }    // ₹1,00,00,000 -> ₹1Cr
  };
  const cheque = {
    id: 'test-cheque',
    account_id: 'test-loan',
    reference: 'LN-TEST',
    borrower_name: 'Test Borrower',
    borrower_phone: '9876543210',
    amount_paise: 100000000,
    scheduled_date: today,
    status: 'PENDING'
  };
  const laterCheque = { ...cheque, id: 'later-cheque', borrower_name: 'Later Borrower', scheduled_date: '2026-11-07', amount_paise: 50000000 };
  const passedCheque = { ...cheque, id: 'passed-cheque', borrower_name: 'Passed Borrower', status: 'PASSED' };
  const bouncedCheque = { ...cheque, id: 'bounced-cheque', borrower_name: 'Bounced Borrower', status: 'BOUNCED' };

  const classListState = new Set<string>();
  const elementMap = new Map<string, any>();

  const createElement = (id: string) => ({
    id,
    value: '',
    textContent: '',
    innerHTML: '',
    disabled: false,
    classList: {
      toggle(cls: string) {
        if (classListState.has(cls)) { classListState.delete(cls); return false; }
        classListState.add(cls); return true;
      },
      add(cls: string) { classListState.add(cls); },
      remove(cls: string) { classListState.delete(cls); },
      contains(cls: string) { return classListState.has(cls); }
    },
    setAttribute(attr: string, val: string) { (this as any)[attr] = val; },
    getAttribute(attr: string) { return (this as any)[attr]; },
    append() {},
    replaceChildren() {}
  });

  const document = {
    createElement(id: string) { return createElement(id); },
    querySelector(selector: string) {
      if (selector === '#app') return app;
      if (!elementMap.has(selector)) {
        elementMap.set(selector, createElement(selector.replace(/^[#.]/, '')));
      }
      return elementMap.get(selector);
    },
    querySelectorAll() { return []; }
  };

  const storage = new Map<string, string>();
  const localStorage = {
    getItem(k: string) { return storage.get(k) ?? null; },
    setItem(k: string, v: string) { storage.set(k, String(v)); }
  };

  const personalAccount = {
    id: 'p-loan-1',
    reference: 'LN-P01',
    type: 'SOLO_SELF_MANAGED',
    arrangement: 'NONE',
    funded_date: '2026-11-01',
    own_net: 90000000,      // ₹9L
    own_face: 100000000,    // ₹10L
    own_profit: 10000000    // ₹1L
  };

  const requests: string[] = [];
  const fetch = async (path: string) => {
    requests.push(path);
    let data: any;
    if (path === '/api/me') data = { username: 'test', ownerId: 'test-owner', csrf: 'test-csrf' };
    else if (path === '/api/cash') data = { started: true, managed: 100000000, personal: 90000000, partnerHeld: 10000000, activity: [] };
    else if (path === '/api/dashboard/business') data = { today, yesterday: '2026-11-04', weekEnd: '2026-11-12', metrics };
    else if (path.startsWith('/api/dashboard/business/analytics?')) data = {
      period: { mode: 'current', start: '2026-11-01', end: '2026-11-30', chartStart: '2025-12-01', chartEnd: '2026-11-30', label: 'Current month' },
      totals: { count: 1, net: 90000000, profit: 10000000, face: 100000000 },
      monthly: [{ month: '2026-11', count: 1, net: 90000000, profit: 10000000 }],
      partners: [{ partyId: 'test-owner', name: 'Ayyappan', loans: 1, net: 90000000, profit: 10000000, share: 100 }],
      forecast: [{ month: '2026-12', scheduled: 10000000, realized: 0, atRisk: 0, future: 10000000 }],
      forecastTotals: { realized: 0, atRisk: 0, future: 10000000 }
    };
    else if (path === '/api/dashboard/personal') data = {
      accounts: [personalAccount],
      totals: {
        ownFace: 100000000,        // ₹10L
        ownNetExpected: 90000000,  // ₹9L
        ownNetFunded: 90000000,    // ₹9L
        ownProfitExpected: 10000000,// ₹1L
        managedCollected: 0
      }
    };
    else if (path.startsWith('/api/cheques?')) {
      const params = new URL(path, 'http://localhost').searchParams;
      const view = params.get('view');
      const rows = view === 'today' && params.get('to') ? [laterCheque, cheque] : view === 'yesterday' ? [cheque, passedCheque, bouncedCheque] : view === 'today' ? [cheque] : [];
      const date = params.get('date') || (view === 'yesterday' ? '2026-11-04' : today);
      data = { view, date, endDate: params.get('to') || date, today, yesterday: '2026-11-04', weekEnd: '2026-11-12', rows, count: rows.length, amount: rows.reduce((n, r) => n + r.amount_paise, 0) };
    } else if (path === '/api/accounts') data = [];
    else if (path === '/api/parties') data = [];
    else throw Error('Unexpected request ' + path);
    return { ok: true, json: async () => data };
  };

  const context: any = {
    document,
    window: { addEventListener() {} },
    fetch,
    location: { hash: '#/business' },
    URLSearchParams,
    BigInt,
    Intl,
    localStorage,
    crypto: { randomUUID: () => 'test-key' },
    alert() {},
    confirm: () => true
  };

  const source = readFileSync(new URL('../public/app.js', import.meta.url), 'utf8');
  runInNewContext(source, context);
  await new Promise(resolve => setImmediate(resolve));

  // 1. Sidebar Structure
  assert.ok(app.innerHTML.includes('Dashboard'));
  const nav = app.innerHTML.match(/<nav class="nav"[^>]*>(.*?)<\/nav>/)?.[1] || '';
  assert.equal((nav.match(/<a /g) || []).length, 7);
  assert.ok(nav.includes('Cheque Schedule'));
  assert.ok(nav.includes("Yesterday's Cheques"));
  assert.ok(nav.includes("All Loans"));
  assert.ok(nav.includes('Add Loan'));
  assert.ok(nav.includes('Borrowers & Partners'));
  assert.ok(nav.includes('Cash Activity'));

  // 2. SVG Icons
  assert.ok(nav.includes('<svg'));

  // 3. Desktop collapse and mobile menu controls
  assert.ok(app.innerHTML.includes('id="menuToggle"'));
  assert.ok(app.innerHTML.includes('id="collapseSidebar"'));
  assert.ok(app.innerHTML.includes('id="sidebarScrim"'));
  assert.ok(app.innerHTML.includes('id="logout"'));

  // 4. Dashboard View Toggle
  assert.ok(app.innerHTML.includes('role="group" aria-label="Dashboard view"'));
  assert.ok(app.innerHTML.includes('href="#/personal"'));
  assert.ok(app.innerHTML.includes('href="#/business"'));

  // 5. Business portfolio and operational totals are rendered from separate live responses.
  assert.ok(app.innerHTML.includes('Loans Managed'));
  assert.ok(app.innerHTML.includes('Amount Invested'));
  assert.ok(app.innerHTML.includes('Expected Profit'));
  assert.ok(app.innerHTML.includes('₹9L'));
  assert.ok(app.innerHTML.includes('₹1L'));
  assert.ok(app.innerHTML.includes('role="group" aria-label="Loans by Month chart style"'));
  assert.ok(app.innerHTML.includes('role="group" aria-label="Profit Forecast chart style"'));
  assert.ok(app.innerHTML.includes('data-chart-view="bar"'));
  assert.ok(app.innerHTML.includes('data-chart-view="line"'));
  assert.ok(app.innerHTML.includes('Cheque Operations'));
  assert.ok(app.innerHTML.includes('₹1L'), 'Cheques today (₹1,00,000) displayed as ₹1L');
  assert.ok(app.innerHTML.includes('₹10L'), "Cheques yesterday (₹10,00,000) displayed as ₹10L");
  assert.ok(app.innerHTML.includes('₹1Cr'), 'Upcoming cheques (₹1,00,00,000) displayed as ₹1Cr');
  assert.ok(app.innerHTML.includes('2 older cheques still awaiting bank results'));

  // 6. Metric cards navigate to cheque views
  const cards = [
    ['#/cheques/today?date=', "Today's Cheques"],
    ['#/cheques/yesterday', "Yesterday's Cheques"],
    ['#/cheques/followup', 'Bounced / Unresolved Cheques'],
    ['#/cheques/upcoming', 'Upcoming Cheques']
  ];
  for (const [href, title] of cards) {
    assert.ok(app.innerHTML.includes('href="' + href), title + ' is reachable');
  }
  for (const [href, title] of cards) {
    context.location.hash = href.startsWith('#/cheques/today?') ? '#/cheques/today' : href;
    await runInNewContext('route()', context);
    assert.ok(app.innerHTML.includes(href.startsWith('#/cheques/today?') ? 'Cheque schedule' : title));
  }

  // 7. Today's cheques has no result action buttons
  context.location.hash = '#/cheques/today';
  await runInNewContext('route()', context);
  assert.ok(app.innerHTML.includes('Test Borrower'));
  assert.ok(!app.innerHTML.includes('class="button small cheque-result"'));
  assert.ok(app.innerHTML.includes('₹10.00L'), 'Cheque amount (₹10,00,000) displayed as ₹10.00L');
  assert.ok(app.innerHTML.includes('class="today-table"'));
  assert.ok(app.innerHTML.includes('Download PDF'));
  assert.ok(app.innerHTML.includes('Showing 1 cheque'));
  assert.ok(app.innerHTML.includes('<strong>Test Borrower</strong>'));
  assert.ok(app.innerHTML.includes('9876543210'));
  assert.ok(!app.innerHTML.includes('<th>Loan Ref</th>'));
  assert.ok(app.innerHTML.includes('Next 7 days'));
  assert.ok(app.innerHTML.includes('id="chequeRangeStart"'));
  context.location.hash = '#/cheques/today?date=2026-11-05&to=2026-11-11';
  await runInNewContext('route()', context);
  assert.ok(requests.some(path => path.includes('/api/cheques?view=today&date=2026-11-05&to=2026-11-11')));
  assert.ok(app.innerHTML.includes('/api/cheques/today.pdf?date=2026-11-05&to=2026-11-11'));
  assert.ok(app.innerHTML.indexOf('5 NOV 26</th>') < app.innerHTML.indexOf('Test Borrower</strong>'));
  assert.ok(app.innerHTML.indexOf('Test Borrower</strong>') < app.innerHTML.indexOf('7 NOV 26</th>'));
  assert.ok(app.innerHTML.indexOf('7 NOV 26</th>') < app.innerHTML.indexOf('Later Borrower</strong>'));

  // 8. Yesterday's cheques has Passed and Bounced buttons
  context.location.hash = '#/cheques/yesterday';
  await runInNewContext('route()', context);
  assert.ok(app.innerHTML.includes('<h1>Yesterday\'s Cheques</h1>'));
  assert.ok(app.innerHTML.includes('4 NOV 26'));
  assert.ok(app.innerHTML.includes('Results confirmed'));
  assert.ok(app.innerHTML.includes('<strong>2</strong>'));
  assert.ok(app.innerHTML.includes('₹30.00L'));
  assert.ok(app.innerHTML.includes('Older pending'));
  assert.ok(app.innerHTML.includes('href="#/cheques/older?date=2026-11-04"'));
  assert.ok(app.innerHTML.includes('class="yesterday-table"'));
  assert.ok(app.innerHTML.includes('href="#/loans/test-loan"'));
  assert.ok(app.innerHTML.includes('<strong>Test Borrower</strong>'));
  assert.ok(!app.innerHTML.includes('Loan reference'));
  assert.ok(!app.innerHTML.includes('LN-TEST'));
  assert.ok(app.innerHTML.includes('class="yesterday-status yesterday-status-passed"'));
  assert.ok(app.innerHTML.includes('class="yesterday-status yesterday-status-bounced"'));
  assert.ok(app.innerHTML.includes('Showing 3 cheques'));
  assert.ok(app.innerHTML.includes('data-status="PASSED"'));
  assert.ok(app.innerHTML.includes('data-status="BOUNCED"'));
  assert.ok(!app.innerHTML.includes('class="result-card'));

  // 9. Personal Finance Dashboard renders under same Dashboard navigation section with compact amounts
  context.location.hash = '#/personal';
  await runInNewContext('route()', context);
  assert.ok(app.innerHTML.includes('Personal finance'));
  assert.ok(app.innerHTML.includes('role="group" aria-label="Dashboard view"'));
  assert.ok(app.innerHTML.includes('href="#/business" title="Dashboard" class="active"'));
  assert.ok(app.innerHTML.includes('₹10L'), 'Personal face displayed as ₹10L');
  assert.ok(app.innerHTML.includes('₹9L'), 'Personal capital displayed as ₹9L');

  // 10. All Loans and Directory navigation
  context.location.hash = '#/loans';
  await runInNewContext('route()', context);
  assert.ok(app.innerHTML.includes('href="#/loans" title="All Loans" class="active"'));

  context.location.hash = '#/parties';
  await runInNewContext('route()', context);
  assert.ok(app.innerHTML.includes('href="#/parties" title="Borrowers & Partners" class="active"'));

  // 11. Test compact currency utility directly for various amounts
  const fmtCompact = runInNewContext('fmtCompact', context);
  assert.equal(fmtCompact(500000), '₹5,000', '₹5,000 stays in standard format');
  assert.equal(fmtCompact(1000000), '₹10,000', '₹10,000 stays in standard format');
  assert.equal(fmtCompact(5000000), '₹0.5L', '₹50,000 switches to ₹0.5L');
  assert.equal(fmtCompact(10000000), '₹1L', '₹1,00,000 switches to ₹1L');
  assert.equal(fmtCompact(100000000), '₹10L', '₹10,00,000 switches to ₹10L');
  assert.equal(fmtCompact(275000000), '₹27.5L', '₹27,50,000 switches to ₹27.5L');
  assert.equal(fmtCompact(1000000000), '₹1Cr', '₹1,00,00,000 switches to ₹1Cr');
  assert.equal(fmtCompact(1500000000), '₹1.5Cr', '₹1,50,00,000 switches to ₹1.5Cr');
});
