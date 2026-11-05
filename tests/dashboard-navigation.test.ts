import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';

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
    amount_paise: 100000000,
    scheduled_date: today,
    status: 'PENDING'
  };

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

  const fetch = async (path: string) => {
    let data: any;
    if (path === '/api/me') data = { username: 'test', ownerId: 'test-owner', csrf: 'test-csrf' };
    else if (path === '/api/dashboard/business') data = { today, yesterday: '2026-11-04', weekEnd: '2026-11-12', metrics };
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
      const view = new URL(path, 'http://localhost').searchParams.get('view');
      const rows = view === 'today' || view === 'yesterday' ? [cheque] : [];
      data = { view, date: view === 'yesterday' ? '2026-11-04' : today, today, yesterday: '2026-11-04', weekEnd: '2026-11-12', rows, count: rows.length, amount: rows.reduce((n, r) => n + r.amount_paise, 0) };
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
  assert.equal((nav.match(/<a /g) || []).length, 5);
  assert.ok(nav.includes("Today's Cheques"));
  assert.ok(nav.includes("Yesterday's Cheques"));
  assert.ok(nav.includes("All Loans"));
  assert.ok(nav.includes('Borrowers, Organisations & Partners'));

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

  // 5. Compact currency formatting on Business Dashboard (₹1L, ₹10L, ₹1Cr)
  assert.ok(app.innerHTML.includes('₹1L'), 'Cheques today (₹1,00,000) displayed as ₹1L');
  assert.ok(app.innerHTML.includes('₹10L'), "Cheques yesterday (₹10,00,000) displayed as ₹10L");
  assert.ok(app.innerHTML.includes('₹1Cr'), 'Upcoming cheques (₹1,00,00,000) displayed as ₹1Cr');
  assert.ok(app.innerHTML.includes('₹2L'), 'Older pending (₹2,00,000) displayed as ₹2L');

  // 6. Metric cards navigate to cheque views
  const cards = [
    ['#/cheques/today', "Today's Cheques"],
    ['#/cheques/yesterday', "Yesterday's Cheques"],
    ['#/cheques/followup', 'Bounced / Unresolved Cheques'],
    ['#/cheques/upcoming', 'Upcoming Cheques']
  ];
  for (const [href, title] of cards) {
    assert.ok(app.innerHTML.includes('href="' + href + '"'));
  }
  for (const [href, title] of cards) {
    context.location.hash = href;
    await runInNewContext('route()', context);
    assert.ok(app.innerHTML.includes(title));
  }

  // 7. Today's cheques has no result action buttons
  context.location.hash = '#/cheques/today';
  await runInNewContext('route()', context);
  assert.ok(app.innerHTML.includes('Test Borrower'));
  assert.ok(!app.innerHTML.includes('class="button small cheque-result"'));
  assert.ok(app.innerHTML.includes('₹10L'), 'Cheque amount (₹10,00,000) displayed as ₹10L');

  // 8. Yesterday's cheques has Passed and Bounced buttons
  context.location.hash = '#/cheques/yesterday';
  await runInNewContext('route()', context);
  assert.ok(app.innerHTML.includes('data-status="PASSED"'));
  assert.ok(app.innerHTML.includes('data-status="BOUNCED"'));

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
  assert.ok(app.innerHTML.includes('href="#/parties" title="Borrowers, Organisations & Partners" class="active"'));

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
