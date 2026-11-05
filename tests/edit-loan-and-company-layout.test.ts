import test from 'node:test';
import assert from 'node:assert/strict';
import { createContext, runInNewContext } from 'node:vm';
import { readFileSync } from 'node:fs';

const appCode = readFileSync(new URL('../public/app.js', import.meta.url), 'utf8');

test('layout displays borrower person on top and organisation below; companies grouped in selectors', async () => {
  const accounts = [
    {
      id: 'loan-1',
      reference: 'LN-SENTHIL-MURUGAN',
      type: 'SOLO_SELF_MANAGED',
      arrangement: 'NONE',
      face_paise: 100000000,
      collected_paise: 0,
      status: 'ACTIVE',
      agreement_date: '2026-11-01',
      rate_text: '10',
      notes: 'Textile expansion',
      borrower_id: 'bor-1',
      borrower_person_name: 'K. Senthil Kumar',
      organization_name: 'Sri Murugan Textiles',
      borrower_name: 'Sri Murugan Textiles'
    },
    {
      id: 'loan-2',
      reference: 'LN-COMPANY-ONLY',
      type: 'SOLO_SELF_MANAGED',
      arrangement: 'NONE',
      face_paise: 50000000,
      collected_paise: 0,
      status: 'ACTIVE',
      agreement_date: '2026-11-02',
      rate_text: '12',
      notes: 'Direct company loan',
      borrower_id: 'org-2',
      borrower_person_name: '',
      organization_name: 'Lakshmi Auto Spares',
      borrower_name: 'Lakshmi Auto Spares'
    },
    {
      id: 'loan-3',
      reference: 'LN-INDIVIDUAL-ONLY',
      type: 'SOLO_SELF_MANAGED',
      arrangement: 'NONE',
      face_paise: 20000000,
      collected_paise: 0,
      status: 'ACTIVE',
      agreement_date: '2026-11-04',
      rate_text: '12',
      notes: 'Direct individual loan',
      borrower_id: 'bor-3',
      borrower_person_name: 'T. Annamalai',
      organization_name: '',
      borrower_name: 'T. Annamalai'
    }
  ];

  const parties = [
    { id: 'org-1', name: 'Sri Murugan Textiles', kind: 'ORGANIZATION', roles: 'BORROWER', active: true, contact_name: 'K. Senthil Kumar' },
    { id: 'org-2', name: 'Lakshmi Auto Spares', kind: 'ORGANIZATION', roles: 'BORROWER', active: true, contact_name: 'R. Karthik' },
    { id: 'bor-1', name: 'K. Senthil Kumar', kind: 'PERSON', roles: 'BORROWER', active: true, organization_name: 'Sri Murugan Textiles' },
    { id: 'bor-3', name: 'T. Annamalai', kind: 'PERSON', roles: 'BORROWER', active: true, organization_name: '' }
  ];

  const app = { innerHTML: '' };
  const elementMap = new Map();

  const makeElement = (tag: string, id: string = '') => {
    const el: any = {
      tagName: tag.toUpperCase(),
      id,
      name: id,
      className: '',
      value: '',
      innerHTML: '',
      textContent: '',
      children: [],
      classList: {
        toggle(cls: string, force?: boolean) { return false; },
        contains(cls: string) { return false; },
        add() {},
        remove() {}
      },
      setAttribute() {},
      getAttribute() { return null; },
      scrollIntoView() {},
      addEventListener() {},
      querySelector(selector: string) {
        if (!elementMap.has(selector)) {
          elementMap.set(selector, makeElement('div', selector.replace('#', '')));
        }
        return elementMap.get(selector);
      },
      querySelectorAll() { return []; },
      append() {},
      replaceChildren() {},
      accountType: { value: 'solo', onchange: null },
      basis: { value: 'FACE_SHARE', onchange: null },
      face: { value: '1000000', oninput: null },
      rate: { value: '10', oninput: null }
    };
    return el;
  };

  const document = {
    createElement(tag: string) {
      return makeElement(tag);
    },
    querySelector(selector: string) {
      if (selector === '#app') return app;
      if (!elementMap.has(selector)) {
        elementMap.set(selector, makeElement('div', selector.replace('#', '')));
      }
      return elementMap.get(selector);
    },
    querySelectorAll(selector: string) {
      return [];
    }
  };

  const context: any = {
    document,
    app,
    URLSearchParams,
    URL,
    crypto,
    setTimeout,
    clearTimeout,
    localStorage: { getItem: () => null, setItem: () => {} },
    sessionStorage: { getItem: () => null, setItem: () => {}, removeItem: () => {} },
    location: { hash: '#/loans' },
    window: { addEventListener: () => {} },
    fetch: async (path: string, opts: any = {}) => {
      let data: any;
      if (path === '/api/me') data = { username: 'ayyappan', ownerId: 'owner-id', csrf: 'csrf-123' };
      else if (path === '/api/accounts') data = accounts;
      else if (path === '/api/parties') data = parties;
      else if (path === '/api/parties/bor-1') data = {
        record: parties[2],
        loans: []
      };
      else if (path === '/api/accounts/loan-1') data = {
        account: accounts[0],
        installments: [{ id: 'inst-1', sequence_no: 1, due_date: '2026-11-06', amount_paise: 10000000, paid_paise: 0, cheque_status: 'PENDING' }],
        contributions: [],
        receipts: [],
        distributions: [],
        collected_paise: 0
      };
      else throw new Error('Unhandled fetch: ' + path);
      return { ok: true, json: async () => data };
    },
    console
  };

  runInNewContext(appCode, context);
  await runInNewContext('init()', context);

  // 1. Verify All Loans displays Borrower on top and Organisation below
  const loanRows = elementMap.get('#loanRows')?.innerHTML || '';
  assert.ok(loanRows.includes('K. Senthil Kumar'), 'Shows borrower person name');
  assert.ok(loanRows.includes('Sri Murugan Textiles'), 'Shows organisation name');
  assert.ok(loanRows.includes('<div class="party-primary"><strong>K. Senthil Kumar</strong></div><div class="party-sub muted mini">Sri Murugan Textiles</div>'), 'Borrower on top, organisation below');
  assert.ok(loanRows.includes('<div class="party-primary"><strong>Lakshmi Auto Spares</strong></div><div class="party-sub muted mini">Organisation</div>'), 'Direct company loan shows company');
  assert.ok(loanRows.includes('<div class="party-primary"><strong>T. Annamalai</strong></div>'), 'Individual borrower loan shows person');

  // 2. Open Loan Detail and verify Header layout and Edit Loan button
  context.location.hash = '#/loans/loan-1';
  await runInNewContext('route()', context);

  assert.ok(app.innerHTML.includes('<h1>K. Senthil Kumar</h1>'), 'Header shows borrower person');
  assert.ok(app.innerHTML.includes('<div class="detail-sub-org">Sri Murugan Textiles</div>'), 'Header shows organisation below borrower');
  assert.ok(app.innerHTML.includes('id="editLoanBtn"'), 'Has Edit Loan button');
  assert.ok(app.innerHTML.includes('id="editLoanSection"'), 'Has Edit Loan form section');
  assert.ok(app.innerHTML.includes('id="editBorrowerId"'), 'Has Borrower/Organisation select');

  // 3. Open Add Loan form and verify companies are at the top of the selector
  context.location.hash = '#/new';
  await runInNewContext('route()', context);

  assert.ok(app.innerHTML.includes('<label for="borrowerId">Company / Borrower</label>'), 'Form labels Company / Borrower');
  assert.ok(app.innerHTML.includes('<optgroup label="Companies / Organisations">'), 'Organisations grouped first');
  assert.ok(app.innerHTML.includes('<optgroup label="Individual Borrowers">'), 'Individual borrowers grouped second');
  assert.ok(app.innerHTML.includes('🏢 Sri Murugan Textiles'), 'Shows company option with icon');
  assert.ok(app.innerHTML.includes('👤 K. Senthil Kumar'), 'Shows individual borrower option with icon');

  // 4. Verify Delete Loan button in All Loans table, Detail page, and Edit Loan section
  assert.ok(loanRows.includes('delete-loan-btn'), 'All Loans table rows have delete loan button');
  context.location.hash = '#/loans/loan-1';
  await runInNewContext('route()', context);
  assert.ok(app.innerHTML.includes('id="deleteLoanDetailBtn"'), 'Loan detail has Delete Loan button');
  assert.ok(app.innerHTML.includes('id="deleteLoanInEditBtn"'), 'Edit loan section has Delete Loan button');

  // 5. Verify Delete Party button in Directory table, profile, and edit form
  context.location.hash = '#/parties?tab=borrowers';
  await runInNewContext('route()', context);
  assert.ok(app.innerHTML.includes('delete-party-btn'), 'Directory list rows have delete party button');

  context.location.hash = '#/parties?tab=borrowers&id=bor-1';
  await runInNewContext('route()', context);
  const profileHtml = elementMap.get('#directoryProfile')?.innerHTML || '';
  assert.ok(profileHtml.includes('delete-party-btn'), 'Directory profile card has delete party button');

  context.location.hash = '#/parties?tab=borrowers&edit=bor-1';
  await runInNewContext('route()', context);
  assert.ok(app.innerHTML.includes('delete-party-btn'), 'Directory edit form has delete party button');
});
