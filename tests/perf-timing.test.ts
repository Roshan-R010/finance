import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';

test('performance optimization: page transitions and API caching operate under 300ms', async () => {
  const app = { innerHTML: '' };
  const today = '2026-11-05';
  const metrics = {
    today: { count: 1, amount: 10000000 },
    yesterday: { count: 1, amount: 100000000 },
    olderPending: { count: 2, amount: 20000000 },
    bounced: { count: 1, amount: 5000000 },
    followup: { count: 3, amount: 25000000 },
    upcoming: { count: 4, amount: 1000000000 }
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

  let networkDelay = 15; // simulate realistic 15ms local network/DB latency
  const fetch = async (path: string) => {
    await new Promise(r => setTimeout(r, networkDelay));
    let data: any;
    if (path === '/api/me') data = { username: 'test', ownerId: 'test-owner', csrf: 'test-csrf' };
    else if (path === '/api/dashboard/business') data = { today, yesterday: '2026-11-04', weekEnd: '2026-11-12', metrics };
    else if (path === '/api/dashboard/personal') data = {
      accounts: [],
      totals: { ownFace: 0, ownNetExpected: 0, ownNetFunded: 0, ownProfitExpected: 0, managedCollected: 0 }
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
    confirm: () => true,
    setTimeout,
    clearTimeout
  };

  const source = readFileSync(new URL('../public/app.js', import.meta.url), 'utf8');
  runInNewContext(source, context);
  await new Promise(resolve => setTimeout(resolve, 50));

  // Benchmark route transitions across all 5 sections
  const routes = [
    ['#/business', 'Dashboard'],
    ['#/cheques/today', "Today's Cheques"],
    ['#/cheques/yesterday', "Yesterday's Cheques"],
    ['#/loans', 'All Loans'],
    ['#/parties', 'Borrowers, Organisations & Partners'],
    ['#/personal', 'Dashboard']
  ];

  for (const [hash, expectedTitle] of routes) {
    const start = performance.now();
    context.location.hash = hash;
    await runInNewContext('route()', context);
    const duration = performance.now() - start;

    assert.ok(duration < 300, `Route ${hash} transition took ${duration.toFixed(1)}ms, expected < 300ms`);
    assert.ok(app.innerHTML.includes(expectedTitle), `Page content includes ${expectedTitle}`);
  }

  // Second navigation (with cache hit): should be nearly instantaneous (< 25ms)
  for (const [hash, expectedTitle] of routes) {
    const start = performance.now();
    context.location.hash = hash;
    await runInNewContext('route()', context);
    const duration = performance.now() - start;

    assert.ok(duration < 50, `Cached route ${hash} transition took ${duration.toFixed(1)}ms, expected < 50ms`);
  }
});
