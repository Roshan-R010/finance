import test from 'node:test';
import assert from 'node:assert/strict';
import { runInNewContext } from 'node:vm';
import { readFileSync } from 'node:fs';

const appCode = readFileSync(new URL('../public/app.js', import.meta.url), 'utf8');

test('company names are borrowers and loan contacts are optional display details', async () => {
  const accounts = [
    {
      id: 'loan-1',
      reference: 'LN-SENTHIL-MURUGAN',
      type: 'SOLO_SELF_MANAGED',
      arrangement: 'NONE',
      face_paise: 100000000,
      net_paise: 90000000,
      interest_paise: 10000000,
      collected_paise: 0,
      status: 'ACTIVE',
      agreement_date: '2026-11-01',
      rate_text: '10',
      notes: 'Textile expansion',
      borrower_id: 'bor-1',
      borrower_person_name: 'K. Senthil Kumar',
      organization_name: 'Sri Murugan Textiles',
      borrower_name: 'Sri Murugan Textiles',
      contact_name: 'Display Only Contact'
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
  const savedPreferences = new Map<string,string>();
  let submittedAccount: any;

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
    localStorage: { getItem: (key:string) => savedPreferences.get(key)||null, setItem: (key:string,value:string) => {savedPreferences.set(key,value);} },
    sessionStorage: { getItem: () => null, setItem: () => {}, removeItem: () => {} },
    location: { hash: '#/loans' },
    window: { addEventListener: () => {} },
    fetch: async (path: string, opts: any = {}) => {
      let data: any;
      if (path === '/api/me') data = { username: 'ayyappan', ownerId: 'owner-id', csrf: 'csrf-123' };
      else if (path === '/api/accounts' && opts.method === 'POST') {
        submittedAccount = JSON.parse(opts.body);
        data = { id: 'new-company-loan' };
      }
      else if (path === '/api/accounts') data = accounts;
      else if (path === '/api/schedule/preview') data = [{ date: '2026-11-06', amount: 100000000 }];
      else if (path === '/api/parties') data = parties;
      else if (path === '/api/external-managers') data = [];
      else if (path === '/api/parties/bor-1') data = {
        record: parties[2],
        loans: []
      };
      else if (path === '/api/accounts/loan-1') data = {
        account: accounts[0],
        installments: [{ id: 'inst-1', cheque_id: 'cheque-1', sequence_no: 1, due_date: '2026-11-05', amount_paise: 10000000, paid_paise: 0, cheque_status: 'PENDING' }],
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
  assert.equal(runInNewContext(`JSON.stringify(parseCustomRows([{amount:'50,000',count:'5'},{amount:'1,50,000',count:''}],40000000n).groups)`, context), '[{"amount":"50000.00","count":5},{"amount":"150000.00","count":1}]');
  assert.equal(runInNewContext(`parseCustomRows([{amount:'',count:'1'}],40000000n).groups.length`, context), 0);
  assert.match(runInNewContext(`parseCustomRows([{amount:'50000',count:'5'}],40000000n).error`, context), /Short by ₹1,50,000/);
  assert.equal(runInNewContext(`parseCustomRows([{amount:'0',count:'2'}],40000000n).invalid`, context), 0);
  await runInNewContext('init()', context);

  // Company names remain the canonical borrower; contacts never enter the list.
  const loanRows = elementMap.get('#loanRows')?.innerHTML || '';
  assert.ok(app.innerHTML.includes('loans-page loan-list-view'));
  assert.ok(!app.innerHTML.includes('aria-label="Loan layout"'));
  assert.ok(!loanRows.includes('Next installment'));
  assert.ok(!loanRows.includes('Missed installment'));
  assert.ok(!loanRows.includes('Installments left'));
  assert.ok(loanRows.includes('<div class="party-primary"><strong>Sri Murugan Textiles</strong></div>'), 'Legacy organisation-linked borrower shows company name');
  assert.ok(loanRows.includes('<div class="party-primary"><strong>Lakshmi Auto Spares</strong></div>'), 'Direct company borrower shows company name');
  assert.ok(loanRows.includes('<div class="party-primary"><strong>T. Annamalai</strong></div>'), 'Individual borrower loan shows person');
  assert.ok(!loanRows.includes('K. Senthil Kumar'), 'Legacy contact does not replace the company');
  assert.ok(!loanRows.includes('Display Only Contact'), 'Optional contact is absent from loan rows');

  // 2. Open Loan Detail and verify Header layout and Edit Loan button
  context.location.hash = '#/loans/loan-1';
  await runInNewContext('route()', context);

  assert.ok(app.innerHTML.includes('<h1>Sri Murugan Textiles</h1>'), 'Header shows company borrower');
  assert.ok(app.innerHTML.includes('<tr><td>Contact person</td><td>Display Only Contact</td></tr>'), 'Loan details display optional contact');
  assert.ok(!app.innerHTML.includes('<h1>Display Only Contact</h1>'), 'Contact is not the borrower headline');
  assert.ok(app.innerHTML.includes('id="editLoanBtn"'), 'Has Edit Loan button');
  assert.ok(app.innerHTML.includes('id="editLoanSection"'), 'Has Edit Loan form section');
  assert.ok(app.innerHTML.includes('id="editBorrowerId"'), 'Has Borrower/Organisation select');
  assert.ok(app.innerHTML.includes('Amount Given</span><strong>₹9,00,000.00'));
  assert.ok(app.innerHTML.includes('Amount Collected</span><strong>₹0.00'));
  assert.ok(app.innerHTML.includes('Yet to Collect</span><strong>₹10,00,000.00'));
  assert.ok(app.innerHTML.includes('05 NOV 26'));
  assert.ok(app.innerHTML.includes('data-id="cheque-1" data-status="PASSED"'));
  assert.ok(app.innerHTML.includes('id="toggle-installments"'));
  assert.ok(app.innerHTML.includes('id="toggle-allocation"'));

  // A company can be selected directly, without a separate organisation record or contact.
  context.location.hash = '#/new';
  await runInNewContext('route()', context);

  assert.ok(app.innerHTML.includes('class="new-loan-page"'), 'Add Loan uses the compact form layout');
  assert.ok(!app.innerHTML.includes('One form for the full recorded account scope.'));
  assert.ok(!app.innerHTML.includes('Start by adding any missing borrower'));
  assert.ok(app.innerHTML.includes('class="new-loan-review"'), 'Live amount summary is present');
  assert.ok(app.innerHTML.includes('Loan Amount</span><strong id="preview-loan"'));
  assert.ok(app.innerHTML.includes('Amount Given</span><strong id="preview-net"'));
  assert.ok(app.innerHTML.includes('Interest Amount</span><strong id="preview-interest"'));
  assert.ok(app.innerHTML.includes('Total to Collect</span><strong id="preview-face"'));
  assert.equal(elementMap.get('#preview-loan').textContent, '₹10,00,000.00');
  assert.equal(elementMap.get('#preview-net').textContent, '₹9,00,000.00');
  assert.ok(app.innerHTML.includes('id="managerField"'), 'External manager field remains available');
  assert.ok(app.innerHTML.includes('id="partnersSection"'), 'Investor section remains available');
  assert.ok(app.innerHTML.includes('id="scheduleFields"'), 'Repayment schedule remains available');
  assert.ok(app.innerHTML.includes('id="customSplitRows"'));
  assert.ok(app.innerHTML.includes('id="splitTotal"'));
  assert.ok(app.innerHTML.includes('Generate Schedule'));
  assert.ok(!app.innerHTML.includes('Funding is confirmed on the loan page after saving.'));
  assert.ok(!app.innerHTML.includes('<textarea id="customSplit"'));
  assert.ok(app.innerHTML.includes('<label for="borrowerId">Borrower</label>'), 'Form has one borrower selector');
  assert.ok(app.innerHTML.includes('<option value="org-2" >Lakshmi Auto Spares</option>'), 'Existing company is available as borrower');
  assert.ok(!app.innerHTML.includes('<optgroup'), 'Borrowers use one shared selector');
  assert.ok(!app.innerHTML.includes('tab=organisations'), 'Loan form has no separate organisation creation action');
  const contactInput = app.innerHTML.match(/<input id="contactName"[^>]*>/)?.[0] || '';
  assert.ok(contactInput, 'Add Loan includes contact name');
  assert.ok(!contactInput.includes('required'), 'Contact name is optional');
  assert.ok(runInNewContext("borrowerSelectOptions(state.parties,'org-2')", context).includes('value="org-2" selected'), 'Company is selectable without a contact');

  const form = elementMap.get('#loan-form');
  Object.assign(form, {
    borrowerId: { value: 'org-2' }, managerId: { value: '' },
    ownerCashSource: { value: 'MANAGED' },
    agreementDate: { value: '2026-11-06' }, notes: { value: '' },
    firstDate: { value: '2026-11-06' }, intervalDays: { value: '7' },
    weekday: { value: '' }, count: { value: '1' }, installmentAmount: { value: '' },
    elements: { namedItem: () => ({ value: '' }) }
  });
  elementMap.get('#scheduleMode').value = 'COUNT';
  await elementMap.get('#previewSchedule').onclick();
  const scheduleHtml = form.querySelector('#schedulePreview').innerHTML;
  assert.ok(scheduleHtml.includes('<th>No.</th><th>Due Date</th><th>Installment Amount</th>'));
  assert.ok(scheduleHtml.includes('id="scheduleDifference"'));
  assert.ok(scheduleHtml.includes('Schedule matches loan amount'));
  form.querySelector('.preview-date[data-index="0"]').value = '2026-11-06';
  form.querySelector('.preview-amount[data-index="0"]').value = '1000000';
  await form.onsubmit({ preventDefault() {} });
  assert.equal(submittedAccount?.borrowerId, 'org-2', 'Loan references company directly');
  assert.equal(submittedAccount?.contactName, '', 'Company loan saves without a contact');

  // 4. Verify Delete Loan button in All Loans table, Detail page, and Edit Loan section
  assert.ok(appCode.includes('id="deleteMode"'), 'Top menu offers bulk delete');
  context.location.hash = '#/loans/loan-1';
  await runInNewContext('route()', context);
  assert.ok(app.innerHTML.includes('id="deleteLoanDetailBtn"'), 'Loan detail has Delete Loan button');
  assert.ok(app.innerHTML.includes('id="deleteLoanInEditBtn"'), 'Edit loan section has Delete Loan button');

  // 5. Verify Delete Party button in Directory table, profile, and edit form
  context.location.hash = '#/parties?tab=borrowers';
  await runInNewContext('route()', context);
  assert.ok(app.innerHTML.includes('delete-party-btn'), 'Directory list rows have delete party button');
  assert.ok(app.innerHTML.includes('tab=borrowers&id=org-1'), 'Company appears in Borrowers directory');
  assert.ok(app.innerHTML.includes('tab=borrowers&id=org-2'), 'All existing company borrowers remain accessible');
  assert.ok(!app.innerHTML.includes('tab=organisations'), 'No Organisations tab');
  assert.ok(!app.innerHTML.includes('<th>Organisation</th>'), 'No Organisation directory column');

  context.location.hash = '#/parties?tab=borrowers&id=bor-1';
  await runInNewContext('route()', context);
  const profileHtml = elementMap.get('#directoryProfile')?.innerHTML || '';
  assert.ok(profileHtml.includes('delete-party-btn'), 'Directory profile card has delete party button');

  context.location.hash = '#/parties?tab=borrowers&edit=bor-1';
  await runInNewContext('route()', context);
  assert.ok(app.innerHTML.includes('delete-party-btn'), 'Directory edit form has delete party button');
  assert.ok(!app.innerHTML.includes('id="organizationId"'), 'Borrower form has no linked organisation input');
});
