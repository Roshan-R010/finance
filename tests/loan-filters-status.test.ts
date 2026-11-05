import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';

test('loan type multi-select categories and status filter with completed and defaulted options', async () => {
  const app = { innerHTML: '' };
  const accounts = [
    {
      id: 'loan-1',
      reference: 'LN-AYYAPPAN',
      type: 'SOLO_SELF_MANAGED',
      arrangement: 'NONE',
      borrower_name: 'Solo Borrower',
      face_paise: 100000000,
      collected_paise: 20000000,
      status: 'ACTIVE',
      agreement_date: '2026-11-01'
    },
    {
      id: 'loan-2',
      reference: 'LN-JOINT',
      type: 'JOINT_SELF_MANAGED',
      arrangement: 'NONE',
      borrower_name: 'Joint Borrower',
      face_paise: 200000000,
      collected_paise: 200000000,
      status: 'COMPLETED',
      agreement_date: '2026-11-02'
    },
    {
      id: 'loan-3',
      reference: 'LN-EXTERNAL',
      type: 'EXTERNAL',
      arrangement: 'MANAGED_POOL',
      manager_name: 'True Finance',
      face_paise: 300000000,
      collected_paise: 10000000,
      status: 'DEFAULTED',
      agreement_date: '2026-11-03'
    }
  ];

  const classListState = new Set<string>();
  const elementMap = new Map<string, any>();

  const createElement = (id: string) => ({
    id,
    value: '',
    checked: false,
    textContent: '',
    innerHTML: '',
    disabled: false,
    classList: {
      toggle(cls: string, force?: boolean) {
        if (force !== undefined) {
          if (force) classListState.add(cls); else classListState.delete(cls);
          return force;
        }
        if (classListState.has(cls)) { classListState.delete(cls); return false; }
        classListState.add(cls); return true;
      },
      add(cls: string) { classListState.add(cls); },
      remove(cls: string) { classListState.delete(cls); },
      contains(cls: string) { return classListState.has(cls); }
    },
    setAttribute(attr: string, val: string) { (this as any)[attr] = val; },
    getAttribute(attr: string) { return (this as any)[attr]; },
    closest(sel: string) { return this; },
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
    querySelectorAll(selector: string) {
      if (selector === '.loan-type-cb:checked') {
        return (context.__checkedTypeCbs || []).filter((cb: any) => cb.checked);
      }
      if (selector === '.loan-type-cb') {
        return context.__checkedTypeCbs || [];
      }
      return [];
    }
  };

  const storage = new Map<string, string>();
  const localStorage = {
    getItem(k: string) { return storage.get(k) ?? null; },
    setItem(k: string, v: string) { storage.set(k, String(v)); }
  };

  const fetch = async (path: string) => {
    let data: any;
    if (path === '/api/me') data = { username: 'test', ownerId: 'test-owner', csrf: 'test-csrf' };
    else if (path === '/api/accounts') data = accounts;
    else if (path === '/api/accounts/loan-1') data = {
      account: accounts[0],
      installments: [],
      contributions: [],
      receipts: [],
      distributions: [],
      collected_paise: accounts[0].collected_paise
    };
    else if (path === '/api/accounts/loan-3') data = {
      account: accounts[2],
      installments: [],
      contributions: [],
      receipts: [],
      distributions: [],
      collected_paise: accounts[2].collected_paise
    };
    else throw Error('Unexpected request ' + path);
    return { ok: true, json: async () => data };
  };

  const cbSolo = { ...createElement('cb-solo'), value: 'SOLO_SELF_MANAGED', checked: false };
  const cbJoint = { ...createElement('cb-joint'), value: 'JOINT_SELF_MANAGED', checked: false };
  const cbExt = { ...createElement('cb-ext'), value: 'EXTERNAL', checked: false };

  const context: any = {
    document,
    window: { addEventListener() {} },
    fetch,
    location: { hash: '#/loans' },
    URLSearchParams,
    BigInt,
    Intl,
    localStorage,
    crypto: { randomUUID: () => 'test-key' },
    alert() {},
    confirm: () => true,
    __checkedTypeCbs: [cbSolo, cbJoint, cbExt]
  };

  const source = readFileSync(new URL('../public/app.js', import.meta.url), 'utf8');
  runInNewContext(source, context);
  await new Promise(resolve => setImmediate(resolve));

  // 1. Verify All Loans markup contains the new categories: Ayyappan, Ayyappan and others, External
  assert.ok(app.innerHTML.includes('Ayyappan</span>'), 'Contains category Ayyappan');
  assert.ok(app.innerHTML.includes('Ayyappan and others</span>'), 'Contains category Ayyappan and others');
  assert.ok(app.innerHTML.includes('External</span>'), 'Contains category External');

  // 2. Verify loan type dropdown supports multi-select checkboxes
  assert.ok(app.innerHTML.includes('id="loanTypeDropdown"'), 'Contains loan type dropdown');
  assert.ok(app.innerHTML.includes('id="loanTypeBtn"'), 'Contains loan type dropdown toggle button');
  assert.ok(app.innerHTML.includes('id="loanTypeMenu"'), 'Contains loan type dropdown menu');
  assert.ok(app.innerHTML.includes('class="loan-type-cb" value="SOLO_SELF_MANAGED"'));
  assert.ok(app.innerHTML.includes('class="loan-type-cb" value="JOINT_SELF_MANAGED"'));
  assert.ok(app.innerHTML.includes('class="loan-type-cb" value="EXTERNAL"'));

  // 3. Verify Status filter has Active, Completed, and Defaulted (Stopped paying)
  assert.ok(app.innerHTML.includes('<option value="ACTIVE">Active</option>'));
  assert.ok(app.innerHTML.includes('<option value="COMPLETED">Completed</option>'));
  assert.ok(app.innerHTML.includes('<option value="DEFAULTED">Defaulted (Stopped paying)</option>'));

  // 4. Verify table rows display the updated loan type labels and status badges
  const loanRows = document.querySelector('#loanRows').innerHTML;
  assert.ok(loanRows.includes('LN-AYYAPPAN'));
  assert.ok(loanRows.includes('LN-JOINT'));
  assert.ok(loanRows.includes('LN-EXTERNAL'));
  assert.ok(loanRows.includes('Completed</span>'));
  assert.ok(loanRows.includes('Defaulted (Stopped paying)</span>'));

  // 5. Test loan detail page for Defaulted loan (loan-3)
  context.location.hash = '#/loans/loan-3';
  await runInNewContext('route()', context);
  assert.ok(app.innerHTML.includes('Defaulted (Stopped paying)'));
  assert.ok(app.innerHTML.includes('id="accountStatusSelect"'));
  assert.ok(app.innerHTML.includes('Borrower has completely stopped paying the debt back'));
});
