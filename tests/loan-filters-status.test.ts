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
      next_due_date: '2026-12-01',
      installments_left: 3,
      missed_count: 0,
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
      next_due_date: null,
      installments_left: 0,
      missed_count: 0,
      agreement_date: '2026-11-02'
    },
    {
      id: 'loan-3',
      reference: 'LN-EXTERNAL',
      type: 'EXTERNAL',
      arrangement: 'MANAGED_POOL',
      manager_id: 'true-finance-id',
      manager_name: 'True Finance',
      receipt_count: 0,
      face_paise: 300000000,
      collected_paise: 10000000,
      status: 'DEFAULTED',
      next_due_date: '2026-10-20',
      installments_left: 4,
      missed_count: 1,
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
    querySelector(sel: string) { const key=id+' '+sel; if(!elementMap.has(key))elementMap.set(key,createElement(key)); return elementMap.get(key); },
    focus() {},
    append(...children: any[]) { (this as any).children=((this as any).children||[]).concat(children); },
    replaceChildren() {}
  });

  const statusChoice = { ...createElement('status-active'), dataset: { value: 'ACTIVE' }, textContent: 'Active' };
  const sortChoice = { ...createElement('sort-old'), dataset: { value: 'old' }, textContent: 'Oldest first' };

  const document = {
    createElement(id: string) { return createElement(id); },
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
      if (selector === '#loanStatusOptions .loan-select-option') return [statusChoice];
      if (selector === '#loanSortOptions .loan-select-option') return [sortChoice];
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
    else if (path === '/api/external-managers') data = [{ id: 'true-finance-id', name: 'True Finance', arrangement: 'MANAGED_POOL', allowedContributorIds: ['ganesh-id'] }];
    else if (path === '/api/parties') data = [{ id: 'ganesh-id', name: 'Ganesh', roles: 'INVESTOR,MANAGER', active: true }];
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
  assert.ok(document.querySelector('.loan-type-cb[value="SOLO_SELF_MANAGED"]').closest('label').querySelector('span').textContent==='Ayyappan Loan', 'Contains Ayyappan Loan');
  assert.ok(document.querySelector('.loan-type-cb[value="JOINT_SELF_MANAGED"]').closest('label').querySelector('span').textContent==='Joint Loan', 'Contains Joint Loan');
  assert.ok(document.querySelector('.loan-type-cb[value="EXTERNAL"]').closest('label').querySelector('span').textContent==='External Investment', 'Contains External Investment');
  assert.ok(document.querySelector('.list-controls').children[0].innerHTML.includes('id="loanThrough"'), 'Contains Through filter');

  // 2. Verify loan type dropdown supports multi-select checkboxes
  assert.ok(app.innerHTML.includes('id="loanTypeDropdown"'), 'Contains loan type dropdown');
  assert.ok(app.innerHTML.includes('id="loanTypeBtn"'), 'Contains loan type dropdown toggle button');
  assert.ok(app.innerHTML.includes('id="loanTypeMenu"'), 'Contains loan type dropdown menu');
  assert.ok(app.innerHTML.includes('class="loan-type-cb" value="SOLO_SELF_MANAGED"'));
  assert.ok(app.innerHTML.includes('class="loan-type-cb" value="JOINT_SELF_MANAGED"'));
  assert.ok(app.innerHTML.includes('class="loan-type-cb" value="EXTERNAL"'));
  assert.ok(app.innerHTML.includes('id="loanStatusTrigger"'));
  assert.ok(app.innerHTML.includes('id="loanSortTrigger"'));
  statusChoice.onclick();
  assert.equal(document.querySelector('#loanStatus').value, 'ACTIVE');
  sortChoice.onclick();
  assert.equal(document.querySelector('#loanSort').value, 'old');
  document.querySelector('#loanStatus').value = '';
  document.querySelector('#loanSort').value = 'new';
  await runInNewContext('route()', context);

  // 3. Verify Status filter has Active, Completed, and Defaulted (Stopped paying)
  assert.ok(app.innerHTML.includes('<option value="ACTIVE">Active</option>'));
  assert.ok(app.innerHTML.includes('<option value="COMPLETED">Completed</option>'));
  assert.ok(app.innerHTML.includes('<option value="DEFAULTED">Defaulted (Stopped paying)</option>'));

  // 4. Verify table rows display the updated loan type labels and status badges
  const loanRows = document.querySelector('#loanRows').innerHTML;
  assert.ok(loanRows.includes('LN-AYYAPPAN'));
  assert.ok(loanRows.includes('LN-JOINT'));
  assert.ok(loanRows.includes('LN-EXTERNAL'));
  assert.ok(loanRows.includes('Not tracked'));
  assert.ok(loanRows.includes('Completed</span>'));
  assert.ok(loanRows.includes('Defaulted (Stopped paying)</span>'));
  assert.ok(loanRows.includes('class="loan-closed"'));
  assert.ok(loanRows.includes('class="loan-missed"'));
  assert.ok(!loanRows.includes('1 DEC 26'));
  assert.ok(!loanRows.includes('Installments left'));

  // 5. Test loan detail page for Defaulted loan (loan-3)
  context.location.hash = '#/loans/loan-3';
  await runInNewContext('route()', context);
  assert.ok(app.innerHTML.includes('Defaulted (Stopped paying)'));
  assert.ok(app.innerHTML.includes('id="accountStatusSelect"'));
  assert.ok(app.innerHTML.includes('Borrower has completely stopped paying the debt back'));
  assert.ok(app.innerHTML.includes('id="editManagerId"'));
  assert.ok(app.innerHTML.includes('id="editPartnerRows"'));
  assert.ok(app.innerHTML.includes('id="editBasis"'));
  assert.ok(app.innerHTML.includes('Through</td><td>True Finance'));
  assert.ok(app.innerHTML.includes('Not tracked'));
  assert.ok(!app.innerHTML.includes('cheque-result-detail passed'));
});
