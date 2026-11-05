const app=document.querySelector('#app');
const state={me:null,parties:[],page:''};
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const fmt=v=>{const n=BigInt(v||0);return '₹'+(n/100n).toLocaleString('en-IN')+'.'+String(n%100n).padStart(2,'0')};
const fmtCompact=v=>{const n=BigInt(v||0);const neg=n<0n;const absN=neg?-n:n;const r=Number(absN)/100;const p=neg?'-₹':'₹';if(r<=10000)return p+Math.round(r).toLocaleString('en-IN');if(r>=10000000)return p+parseFloat((r/10000000).toFixed(2))+'Cr';return p+parseFloat((r/100000).toFixed(2))+'L';};
const rawMoney=v=>{const n=BigInt(v||0);return String(n/100n)+'.'+String(n%100n).padStart(2,'0')};
const rupees=v=>{const s=String(v||'').trim();return /^\d+(\.\d{1,2})?$/.test(s)?BigInt(s.split('.')[0])*100n+BigInt((s.split('.')[1]||'').padEnd(2,'0')):0n};
const localDate=()=>new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Kolkata',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
const addDays=(s,n)=>{const d=new Date(s+'T00:00:00Z');d.setUTCDate(d.getUTCDate()+n);return d.toISOString().slice(0,10)};
const labelType=a=>a.type==='SOLO_SELF_MANAGED'?'Ayyappan':a.type==='JOINT_SELF_MANAGED'?'Ayyappan and others':'External';
const statusPill=a=>{const isPaidOff=a.face_paise>0&&a.collected_paise>=a.face_paise;const s=(a.status==='ACTIVE'&&isPaidOff)?'COMPLETED':a.status;if(s==='COMPLETED')return pill('Completed','green');if(s==='DEFAULTED'||s==='STOPPED_PAYING')return pill('Defaulted (Stopped paying)','red');return pill(s||'Active');};
const pill=(text,tone='')=>`<span class="pill ${tone}">${esc(text)}</span>`;
const empty=(text)=>`<div class="empty">${esc(text)}</div>`;
const field=(name,label,type='text',value='',extra='')=>`<div class="field"><label for="${name}">${label}</label><input id="${name}" name="${name}" type="${type}" value="${esc(value)}" ${extra}></div>`;
const apiCache=new Map();
function prefetch(path){
  if(!state.me||!path)return;
  if(apiCache.has(path)){const entry=apiCache.get(path);if(Date.now()-entry.time<30000)return;}
  fetch('/api'+path,{credentials:'same-origin'}).then(r=>r.ok?r.json():null).then(data=>{if(data)apiCache.set(path,{data,time:Date.now()});}).catch(()=>{});
}
async function api(path,options={}){
  const isGet=!options.method||options.method==='GET';
  if(isGet&&apiCache.has(path)){
    const entry=apiCache.get(path);
    if(Date.now()-entry.time<30000)return entry.data;
  }
  const prog=document.querySelector('#routeProgress');
  let timer=null;
  if(prog&&typeof setTimeout!=='undefined')timer=setTimeout(()=>prog.classList.add('active'),60);
  try{
    const response=await fetch('/api'+path,{credentials:'same-origin',...options,headers:{...(options.body?{'content-type':'application/json'}:{}),...(state.me?.csrf&&options.method&&options.method!=='GET'?{'x-csrf-token':state.me.csrf,'idempotency-key':crypto.randomUUID()}:{}),...options.headers}});
    const data=await response.json();
    if(!response.ok)throw Error(data.error||'Request failed.');
    if(isGet)apiCache.set(path,{data,time:Date.now()});
    else apiCache.clear();
    return data;
  }finally{
    if(timer&&typeof clearTimeout!=='undefined')clearTimeout(timer);
    if(prog)prog.classList.remove('active');
  }
}
async function post(path,data){return api(path,{method:'POST',body:JSON.stringify(data)});}
function error(form,err){const box=form.querySelector('.form-error');if(box)box.textContent=err.message||String(err);else alert(err.message||String(err));}
const ICONS = {"dashboard":"<svg width=\"18\" height=\"18\" viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"2\" stroke-linecap=\"round\" stroke-linejoin=\"round\"><rect width=\"7\" height=\"9\" x=\"3\" y=\"3\" rx=\"1\"/><rect width=\"7\" height=\"5\" x=\"14\" y=\"3\" rx=\"1\"/><rect width=\"7\" height=\"9\" x=\"14\" y=\"12\" rx=\"1\"/><rect width=\"7\" height=\"5\" x=\"3\" y=\"16\" rx=\"1\"/></svg>","today":"<svg width=\"18\" height=\"18\" viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"2\" stroke-linecap=\"round\" stroke-linejoin=\"round\"><path d=\"M8 2v4\"/><path d=\"M16 2v4\"/><rect width=\"18\" height=\"18\" x=\"3\" y=\"4\" rx=\"2\"/><path d=\"M3 10h18\"/><path d=\"m9 16 2 2 4-4\"/></svg>","yesterday":"<svg width=\"18\" height=\"18\" viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"2\" stroke-linecap=\"round\" stroke-linejoin=\"round\"><path d=\"M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8\"/><path d=\"M3 3v5h5\"/><path d=\"M12 7v5l4 2\"/></svg>","loans":"<svg width=\"18\" height=\"18\" viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"2\" stroke-linecap=\"round\" stroke-linejoin=\"round\"><rect width=\"20\" height=\"12\" x=\"2\" y=\"6\" rx=\"2\"/><circle cx=\"12\" cy=\"12\" r=\"2\"/><path d=\"M6 12h.01M18 12h.01\"/></svg>","parties":"<svg width=\"18\" height=\"18\" viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"2\" stroke-linecap=\"round\" stroke-linejoin=\"round\"><path d=\"M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2\"/><circle cx=\"9\" cy=\"7\" r=\"4\"/><path d=\"M22 21v-2a4 4 0 0 0-3-3.87\"/><path d=\"M16 3.13a4 4 0 0 1 0 7.75\"/></svg>","menu":"<svg width=\"20\" height=\"20\" viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"2\" stroke-linecap=\"round\" stroke-linejoin=\"round\"><line x1=\"4\" x2=\"20\" y1=\"12\" y2=\"12\"/><line x1=\"4\" x2=\"20\" y1=\"6\" y2=\"6\"/><line x1=\"4\" x2=\"20\" y1=\"18\" y2=\"18\"/></svg>","collapseOpen":"<svg width=\"18\" height=\"18\" viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"2\" stroke-linecap=\"round\" stroke-linejoin=\"round\"><rect width=\"18\" height=\"18\" x=\"3\" y=\"3\" rx=\"2\"/><path d=\"M9 3v18\"/><path d=\"m16 15-3-3 3-3\"/></svg>","collapseClosed":"<svg width=\"18\" height=\"18\" viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"2\" stroke-linecap=\"round\" stroke-linejoin=\"round\"><rect width=\"18\" height=\"18\" x=\"3\" y=\"3\" rx=\"2\"/><path d=\"M9 3v18\"/><path d=\"m14 9 3 3-3 3\"/></svg>","logout":"<svg width=\"18\" height=\"18\" viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"2\" stroke-linecap=\"round\" stroke-linejoin=\"round\"><path d=\"M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4\"/><polyline points=\"16 17 21 12 16 7\"/><line x1=\"21\" x2=\"9\" y1=\"12\" y2=\"12\"/></svg>"};
function shell(active, content, title = 'Workspace') {
  const links = [
    ['business', ICONS.dashboard, 'Dashboard'],
    ['cheques/today', ICONS.today, "Today's Cheques"],
    ['cheques/yesterday', ICONS.yesterday, "Yesterday's Cheques"],
    ['loans', ICONS.loans, 'All Loans'],
    ['parties', ICONS.parties, 'Borrowers, Organisations & Partners']
  ];
  const isLinkActive = key => {
    if (key === 'business') return active === 'business' || active === 'personal';
    if (key === 'loans') return active === 'loans' || active === 'new';
    return active === key;
  };
  const navHtml = links.map(([key, icon, label]) => `<a href="#/${key}" title="${label}" class="${isLinkActive(key) ? "active" : ""}"><span class="icon" aria-hidden="true">${icon}</span><span class="nav-label">${label}</span></a>`).join("");

  app.innerHTML = `<div class="shell ${localStorage.getItem('sidebarCollapsed') === '1' ? 'sidebar-collapsed' : ''}"><div class="sidebar-scrim" id="sidebarScrim" tabindex="-1"></div><aside class="sidebar" id="sidebar" aria-label="Main Navigation"><a href="#/business" class="brand" title="Ayyappan Finance"><div class="brand-mark">AF</div><div class="brand-copy"><strong>Ayyappan Finance</strong><small>Private finance workspace</small></div></a><div class="side-navigation"><div class="nav-title">Workspace</div><nav class="nav" aria-label="Primary navigation">${navHtml}</nav></div><div class="side-bottom"><div class="side-account" title="${esc(state.me.username)}"><span class="avatar">A</span><span class="account-name">${esc(state.me.username)}</span></div><button id="collapseSidebar" class="collapse-sidebar-btn" type="button" aria-label="Collapse sidebar" title="Toggle sidebar"><span class="icon collapse-icon-open" aria-hidden="true">${ICONS.collapseOpen}</span><span class="icon collapse-icon-closed" aria-hidden="true">${ICONS.collapseClosed}</span><span class="collapse-label">Collapse</span></button><button id="logout" type="button" title="Sign out" aria-label="Sign out"><span class="icon" aria-hidden="true">${ICONS.logout}</span><span class="logout-label">Sign out</span></button></div></aside><div class="main"><header class="topbar"><div class="route-progress" id="routeProgress" aria-hidden="true"></div><button id="menuToggle" type="button" aria-label="Open navigation" aria-expanded="false">${ICONS.menu}</button><span class="location">${esc(title)}</span><div class="top-actions"><span class="mini muted">${esc(state.me.username)}</span><span class="avatar">A</span></div></header><main class="content content-animating">${content}<div class="footer-note">All amounts in INR · Dates use Asia/Kolkata · Expected profit is not received profit</div></main></div></div>`;

  const root = document.querySelector('.shell'), menu = document.querySelector('#menuToggle'), scrim = document.querySelector('#sidebarScrim');
  const closeSidebar = () => { if (root) root.classList.remove('sidebar-open'); if (menu) menu.setAttribute('aria-expanded', 'false'); };
  if (menu) { menu.onclick = () => { const open = root.classList.toggle('sidebar-open'); menu.setAttribute('aria-expanded', String(open)); }; }
  if (scrim) scrim.onclick = closeSidebar;
  document.querySelectorAll('.nav a').forEach(a => {
    a.onclick = closeSidebar;
    const h = a.getAttribute ? a.getAttribute('href') : a.href;
    const trigger = () => {
      if (h === '#/business') prefetch('/dashboard/business');
      else if (h === '#/cheques/today') prefetch('/cheques?view=today');
      else if (h === '#/cheques/yesterday') { prefetch('/cheques?view=yesterday'); prefetch('/cheques?view=older'); }
      else if (h === '#/loans') prefetch('/accounts');
      else if (h === '#/parties') prefetch('/parties');
    };
    if (a.addEventListener) a.addEventListener('mouseenter', trigger);
    else a.onmouseenter = trigger;
  });
  const collapse = document.querySelector('#collapseSidebar');
  if (collapse) { collapse.onclick = () => { root.classList.toggle('sidebar-collapsed'); localStorage.setItem('sidebarCollapsed', root.classList.contains('sidebar-collapsed') ? '1' : '0'); }; }
  const logout = document.querySelector('#logout');
  if (logout) { logout.onclick = async () => { await post('/logout', {}); state.me = null; location.hash = ''; await init(); }; }
}
function heading(eyebrow,title,sub,action=''){return `<div class="heading"><div><div class="eyebrow">${eyebrow}</div><h1>${title}</h1><p>${sub}</p></div>${action}</div>`;}
function dashboardToggle(active){return `<div class="dashboard-switch" role="group" aria-label="Dashboard view"><a href="#/business" class="${active==='business'?'selected':''}" aria-current="${active==='business'?'page':'false'}">Business</a><a href="#/personal" class="${active==='personal'?'selected':''}" aria-current="${active==='personal'?'page':'false'}">Personal Finance</a></div>`;}
function metric(label,value,note='',highlight=false,raw=''){return `<div class="metric-card ${highlight?'highlight':''}"><div class="label">${label}</div><div class="value money" ${raw?`title="${esc(raw)}"`:''}>${value}</div><div class="note">${note}</div></div>`;}
function loginPage(setup){app.innerHTML=`<div class="login-shell"><div class="login-hero"><div class="brand-mark">AF</div><div><div class="eyebrow" style="color:#b8dbbf">PRIVATE FINANCE WORKSPACE</div><h1>Clarity for every loan, collection, and investment.</h1><p>Track the full managed account and your own capital in one careful ledger.</p></div><div class="mini" style="color:#a9c8b3">Ayyappan Finance · Local edition</div></div><div class="login-form-area"><form class="login-card" id="auth-form"><div class="eyebrow">${setup?'FIRST-TIME SETUP':'WELCOME BACK'}</div><h2>${setup?'Create your private login':'Sign in to your workspace'}</h2><p class="sub">${setup?'Choose an administrator username and a password of at least 12 characters.':'Your loan records and personal investment details are protected.'}</p>${field('username','Username','text','', 'autocomplete="username" required')}${field('password','Password','password','',`autocomplete="${setup?'new-password':'current-password'}" required minlength="${setup?12:1}"`)}<button class="button" type="submit">${setup?'Create workspace':'Sign in'} →</button><p class="form-error" role="alert"></p></form></div></div>`;document.querySelector('#auth-form').onsubmit=async ev=>{ev.preventDefault();const f=ev.currentTarget;try{await post(setup?'/setup':'/login',{username:f.username.value,password:f.password.value});if(setup){const result=await post('/login',{username:f.username.value,password:f.password.value});}await init();}catch(err){error(f,err);}};}
async function loadParties(){state.parties=await api('/parties');}
function options(parties,selected='',placeholder='Select a person or company'){return `<option value="">${placeholder}</option>`+parties.map(p=>`<option value="${p.id}" ${p.id===selected?'selected':''}>${esc(p.name)}</option>`).join('');}
function borrowerSelectOptions(parties,selectedId=''){
  const orgs=parties.filter(p=>p.active&&p.kind==='ORGANIZATION'&&!/INVESTOR|MANAGER|OWNER/i.test(p.roles||''));
  const persons=parties.filter(p=>p.active&&p.kind==='PERSON'&&/BORROWER/i.test(p.roles||''));
  let html='<option value="">Select company or borrower</option>';
  if(orgs.length){
    html+='<optgroup label="Companies / Organisations">';
    for(const org of orgs){
      const sel=org.id===selectedId?' selected':'';
      html+=`<option value="${org.id}"${sel}>🏢 ${esc(org.name)}${org.contact_name?` (Contact: ${esc(org.contact_name)})`:''}</option>`;
    }
    html+='</optgroup>';
  }
  if(persons.length){
    html+='<optgroup label="Individual Borrowers">';
    for(const p of persons){
      const sel=p.id===selectedId?' selected':'';
      const orgInfo=p.organization_name?` · Org: ${p.organization_name}`:' · Individual';
      html+=`<option value="${p.id}"${sel}>👤 ${esc(p.name)}${esc(orgInfo)}</option>`;
    }
    html+='</optgroup>';
  }
  return html;
}
function partyDisplay(item){
  const person=item.borrower_person_name;
  const org=item.organization_name;
  if(person&&org){
    return `<div class="party-primary"><strong>${esc(person)}</strong></div><div class="party-sub muted mini">${esc(org)}</div>`;
  }
  if(org){
    return `<div class="party-primary"><strong>${esc(org)}</strong></div><div class="party-sub muted mini">Organisation</div>`;
  }
  if(person){
    return `<div class="party-primary"><strong>${esc(person)}</strong></div>`;
  }
  if(item.borrower_name){
    return `<div class="party-primary"><strong>${esc(item.borrower_name)}</strong></div>`;
  }
  if(item.manager_name){
    return `<div class="party-primary"><strong>${esc(item.manager_name)}</strong></div><div class="party-sub muted mini">External Manager</div>`;
  }
  return '—';
}
function chequeCard(title,group,href,note,highlight=false){return `<a class="metric-card cheque-metric ${highlight?'highlight':''}" href="${href}"><div class="label">${esc(title)}</div><div class="value">${group.count}</div><div class="cheque-amount" title="${fmt(group.amount)}">${fmtCompact(group.amount)}</div><div class="note">${esc(note)}</div><span class="cheque-card-arrow" aria-hidden="true">↗</span></a>`;}
async function renderBusiness(){
  const d=await api('/dashboard/business');
  shell('business',`${heading('COLLECTION OPERATIONS','Dashboard','One scheduled record per open installment. Deposit status is not tracked; only a confirmed Passed result counts as payment.')}${dashboardToggle('business')}
  <div class="metrics cheque-metrics">
    ${chequeCard('Cheques to Deposit Today',d.metrics.today,'#/cheques/today','Scheduled today · deposit status not recorded',true)}
    ${chequeCard("Yesterday's Cheques — Verify Results",d.metrics.yesterday,'#/cheques/yesterday','Bank result not yet confirmed')}
    ${chequeCard('Bounced / Unresolved Cheques',d.metrics.followup,'#/cheques/followup',`${d.metrics.bounced.count} bounced · ${d.metrics.olderPending.count} older pending`)}
    ${chequeCard('Upcoming Cheques — Next 7 Days',d.metrics.upcoming,'#/cheques/upcoming',`Tomorrow through ${d.weekEnd}`)}
  </div>
  <section class="card followup-card"><div><h2>Older results still pending</h2><p class="card-sub">${d.metrics.olderPending.count} scheduled cheque records before ${esc(d.yesterday)} still need a bank result. Total <strong title="${fmt(d.metrics.olderPending.amount)}">${fmtCompact(d.metrics.olderPending.amount)}</strong>.</p></div><a class="button secondary" href="#/cheques/older">Review older pending →</a></section>`,'Dashboard');
}
async function renderCheques(view,selectedDate){
  const query=new URLSearchParams({view});if(selectedDate)query.set('date',selectedDate);
  const targetDate=selectedDate||(view==='yesterday'?addDays(localDate(),-1):localDate());
  const [report,older]=await Promise.all([
    api('/cheques?'+query.toString()),
    view==='yesterday'?api('/cheques?'+new URLSearchParams({view:'older',date:targetDate}).toString()):Promise.resolve(null)
  ]);
  const titles={today:"Today's Cheques",yesterday:"Yesterday's Cheques — Verify Results",older:'Older Pending Results',followup:'Bounced / Unresolved Cheques',upcoming:'Upcoming Cheques — Next 7 Days'};
  const title=titles[view]||'Cheques',canResolve=['yesterday','older','followup'].includes(view);
  const action=view==='today'?`<a class="button" href="/api/cheques/today.pdf?date=${encodeURIComponent(report.date)}">Download PDF</a>`:'';
  const dateField=['today','yesterday'].includes(view)?`<div class="field cheque-date-field"><label for="chequeDate">Scheduled date</label><input id="chequeDate" type="date" value="${esc(report.date)}"></div>`:'';
  const rows=report.rows.map(c=>{
    const partyCell = c.borrower_person_name && c.organization_name
      ? `<div><strong>${esc(c.borrower_person_name)}</strong></div><div class="sub-org">${esc(c.organization_name)}</div>`
      : `<div><strong>${esc(c.organization_name || c.borrower_person_name || c.borrower_name || 'Borrower')}</strong></div>`;
    return `<tr><td>${partyCell}<div class="muted mini"><a class="text-link" href="#/loans/${c.account_id}">${esc(c.reference)}</a></div></td><td class="money">${fmt(c.amount_paise)}</td>${view==='today'?'':`<td>${esc(c.scheduled_date)}</td><td>${pill(c.status==='PENDING'?'Unverified':c.status==='PASSED'?'Passed':'Bounced',c.status==='BOUNCED'?'red':c.status==='PENDING'?'amber':'')}</td><td>${c.status==='PENDING'&&canResolve?`<div class="result-actions"><button class="button small cheque-result" data-id="${esc(c.id)}" data-status="PASSED">Passed</button><button class="button small secondary cheque-result" data-id="${esc(c.id)}" data-status="BOUNCED">Bounced</button></div>`:'—'}</td>`}</tr>`;
  }).join('');
  const table=report.rows.length?`<div class="table-wrap"><table class="table cheque-table"><thead><tr><th>Borrower & Organisation</th><th>Cheque Amount</th>${view==='today'?'':'<th>Scheduled Date</th><th>Current Status</th><th>Actions</th>'}</tr></thead><tbody>${rows}</tbody></table></div>`:empty(view==='today'?'No scheduled cheques for this date.':'No cheques in this view.');
  const subtitle=view==='today'?'Scheduled deposit worklist. Deposit status is not recorded here; bank results are confirmed separately.':view==='yesterday'?'Confirm Passed or Bounced only after the bank result is known.':view==='upcoming'?`Scheduled tomorrow through ${esc(report.weekEnd)}.`:'Pending and bounced items remain visible until resolved.';
  shell(view==='today'?'cheques/today':'cheques/yesterday',`${heading('CHEQUE OPERATIONS',title,subtitle,action)}
    <div class="cheque-toolbar">${dateField}<div class="cheque-total"><strong>${report.count}</strong><span>${view==='today'?'scheduled':'cheques'}</span></div><div class="cheque-total amount"><strong title="${fmt(report.amount)}">${fmtCompact(report.amount)}</strong><span>Total cheque amount</span></div></div>
    ${older?`<div class="banner"><strong>Older pending results: ${older.count}</strong> · <span title="${fmt(older.amount)}">${fmtCompact(older.amount)}</span> <a class="text-link" href="#/cheques/older?date=${encodeURIComponent(report.date)}">Review older records →</a></div>`:''}
    <section class="card"><div class="card-head"><h2>${view==='today'?'Scheduled cheques':'Cheque records'}</h2><div class="field cheque-search"><label for="chequeSearch">Search</label><input id="chequeSearch" placeholder="Borrower, organisation or loan reference"></div></div>${table}</section>`,title);
  const dateInput=document.querySelector('#chequeDate');if(dateInput)dateInput.onchange=ev=>{location.hash='#/cheques/'+view+'?date='+encodeURIComponent(ev.target.value);};
  const search=document.querySelector('#chequeSearch');if(search)search.oninput=ev=>{const term=ev.target.value.toLocaleLowerCase();document.querySelectorAll('.cheque-table tbody tr').forEach(row=>row.classList.toggle('hide',!row.textContent.toLocaleLowerCase().includes(term)));};
  document.querySelectorAll('.cheque-result').forEach(button=>button.onclick=async()=>{const status=button.dataset.status;if(!confirm(`Confirm this cheque as ${status==='PASSED'?'Passed':'Bounced'}? ${status==='PASSED'?'This records a confirmed receipt and reduces the loan balance.':'The loan balance will stay open.'}`))return;button.disabled=true;try{await post(`/cheques/${button.dataset.id}/result`,{status});await renderCheques(view,selectedDate);}catch(err){button.disabled=false;alert(err.message);}});
}
async function renderPersonal(){const d=await api('/dashboard/personal');shell('personal',`${heading('OWNER VIEW','Personal finance','Your own entitlement across self-managed and externally managed accounts.')}${dashboardToggle('personal')}
  <div class="banner">Expected profit is an agreement projection. Received profit is intentionally not calculated until the partial-receipt allocation policy is approved.</div>
  <div class="metrics">${metric('Own face entitlement',fmtCompact(d.totals.ownFace),'Across all accounts',true,fmt(d.totals.ownFace))}${metric('Own capital expected',fmtCompact(d.totals.ownNetExpected),'Net of upfront discount',false,fmt(d.totals.ownNetExpected))}${metric('Capital confirmed funded',fmtCompact(d.totals.ownNetFunded),'Explicitly marked as disbursed',false,fmt(d.totals.ownNetFunded))}${metric('Expected gross profit',fmtCompact(d.totals.ownProfitExpected),'Assumes full collection',false,fmt(d.totals.ownProfitExpected))}</div>
  <section class="card"><div class="card-head"><h2>Your account positions</h2>${pill(`${d.accounts.length} accounts`)}</div>${d.accounts.length?`<div class="table-wrap"><table class="table"><thead><tr><th>Account</th><th>Arrangement</th><th>Own capital</th><th>Own face</th><th>Expected profit</th><th>Funding</th></tr></thead><tbody>${d.accounts.map(a=>`<tr><td><a class="text-link" href="#/loans/${a.id}">${esc(a.reference)}</a></td><td>${esc(labelType(a))}</td><td class="money" title="${fmt(a.own_net)}">${fmtCompact(a.own_net)}</td><td class="money" title="${fmt(a.own_face)}">${fmtCompact(a.own_face)}</td><td class="money" title="${fmt(a.own_profit)}">${fmtCompact(a.own_profit)}</td><td>${a.funded_date?pill('Confirmed'):pill('Not confirmed','amber')}</td></tr>`).join('')}</tbody></table></div>`:empty('Add a loan to see your personal position.')}</section>`, 'Dashboard');}
async function renderLoans(){
  const rows=await api('/accounts');
  const borrowerOptions=[...new Set(rows.flatMap(a=>[a.borrower_person_name,a.organization_name,a.borrower_name]).filter(Boolean))].sort();
  const choices=(values)=>[...new Set(values.filter(Boolean))].sort().map(v=>`<option value="${esc(v)}">${esc(v)}</option>`).join('');
  shell('loans',`${heading('PORTFOLIO','All Loans','Search and manage every recorded loan and investment.','<a class="button" href="#/new">＋ Add Loan</a>')}<div class="list-controls"><div class="field search"><label for="loanSearch">Search</label><input id="loanSearch" type="search" placeholder="Reference, borrower, organisation or manager"></div><div class="field type-filter-field"><label for="loanTypeBtn">Loan type</label><div class="multi-dropdown" id="loanTypeDropdown"><button type="button" id="loanTypeBtn" class="dropdown-btn" aria-haspopup="listbox" aria-expanded="false"><span id="loanTypeBtnText">All types</span><span class="dropdown-arrow" aria-hidden="true">▾</span></button><div class="dropdown-menu hide" id="loanTypeMenu" role="listbox"><label class="dropdown-item"><input type="checkbox" class="loan-type-cb" value="SOLO_SELF_MANAGED"> <span>Ayyappan</span></label><label class="dropdown-item"><input type="checkbox" class="loan-type-cb" value="JOINT_SELF_MANAGED"> <span>Ayyappan and others</span></label><label class="dropdown-item"><input type="checkbox" class="loan-type-cb" value="EXTERNAL"> <span>External</span></label></div></div></div><div class="field"><label for="loanStatus">Status</label><select id="loanStatus"><option value="">All statuses</option><option value="ACTIVE">Active</option><option value="COMPLETED">Completed</option><option value="DEFAULTED">Defaulted (Stopped paying)</option></select></div><div class="field"><label for="loanBorrower">Borrower / Organisation</label><select id="loanBorrower"><option value="">All borrowers & organisations</option>${choices(borrowerOptions)}</select></div><div class="field"><label for="loanManager">Manager</label><select id="loanManager"><option value="">All managers</option>${choices(rows.map(a=>a.manager_name))}</select></div><div class="field"><label for="loanSort">Sort</label><select id="loanSort"><option value="new">Newest first</option><option value="old">Oldest first</option><option value="face">Highest face value</option><option value="outstanding">Highest outstanding</option><option value="reference">Reference A–Z</option></select></div></div><section class="card"><div class="card-head"><h2>Loan accounts</h2><span id="loanCount" class="pill"></span></div><div class="table-wrap"><table class="table"><thead><tr><th>Reference</th><th>Borrower & Organisation</th><th>Loan type</th><th>Recorded scope</th><th>Outstanding</th><th>Status</th><th></th></tr></thead><tbody id="loanRows"></tbody></table></div><div class="pagination"><button class="button secondary small" id="prevLoans" type="button">Previous</button><span id="loanPage"></span><button class="button secondary small" id="nextLoans" type="button">Next</button></div></section>`, 'All Loans');
  let page=1;const perPage=20;
  function draw(){
    const val=id=>document.querySelector('#'+id)?.value||'';
    const term=val('loanSearch').toLocaleLowerCase();
    const checkedTypes=[...document.querySelectorAll('.loan-type-cb:checked')].map(cb=>cb.value);
    const statusVal=val('loanStatus');
    let filtered=rows.filter(a=>{
      if(term&&![a.reference,a.borrower_name,a.borrower_person_name,a.organization_name,a.manager_name].some(x=>String(x||'').toLocaleLowerCase().includes(term)))return false;
      if(checkedTypes.length&&!checkedTypes.includes(a.type))return false;
      if(statusVal){
        const isPaidOff=a.face_paise>0&&a.collected_paise>=a.face_paise;
        const s=(a.status==='ACTIVE'&&isPaidOff)?'COMPLETED':a.status;
        if(statusVal==='ACTIVE'&&s!=='ACTIVE')return false;
        if(statusVal==='COMPLETED'&&s!=='COMPLETED')return false;
        if(statusVal==='DEFAULTED'&&(s!=='DEFAULTED'&&s!=='STOPPED_PAYING'))return false;
        if(!['ACTIVE','COMPLETED','DEFAULTED'].includes(statusVal)&&a.status!==statusVal)return false;
      }
      if(val('loanBorrower')&&![a.borrower_name,a.borrower_person_name,a.organization_name].includes(val('loanBorrower')))return false;
      if(val('loanManager')&&a.manager_name!==val('loanManager'))return false;
      return true;
    });
    const sort=val('loanSort');
    filtered.sort((a,b)=>sort==='old'?a.agreement_date.localeCompare(b.agreement_date):sort==='face'?b.face_paise-a.face_paise:sort==='outstanding'?(b.face_paise-b.collected_paise)-(a.face_paise-a.collected_paise):sort==='reference'?a.reference.localeCompare(b.reference):b.agreement_date.localeCompare(a.agreement_date));
    const pages=Math.max(1,Math.ceil(filtered.length/perPage));
    page=Math.min(page,pages);
    document.querySelector('#loanCount').textContent=`${filtered.length} loans`;
    document.querySelector('#loanPage').textContent=`Page ${page} of ${pages}`;
    document.querySelector('#prevLoans').disabled=page===1;
    document.querySelector('#nextLoans').disabled=page===pages;
    document.querySelector('#loanRows').innerHTML=filtered.slice((page-1)*perPage,page*perPage).map(a=>`<tr><td><a class="text-link" href="#/loans/${a.id}">${esc(a.reference)}</a><div class="muted mini">${esc(a.agreement_date)}</div></td><td>${partyDisplay(a)}</td><td>${pill(labelType(a),a.type==='EXTERNAL'?'amber':'')}</td><td class="money" title="${fmt(a.face_paise)}">${fmtCompact(a.face_paise)}</td><td class="money" title="${fmt(a.face_paise-a.collected_paise)}"><strong title="${fmt(a.face_paise-a.collected_paise)}">${fmtCompact(a.face_paise-a.collected_paise)}</strong></td><td>${statusPill(a)}</td><td><a class="text-link" href="#/loans/${a.id}">Open</a> · <button class="button-link danger delete-loan-btn" data-id="${a.id}" data-ref="${esc(a.reference)}" type="button">Delete</button></td></tr>`).join('')||`<tr><td colspan="7">No matching loans.</td></tr>`;
    document.querySelectorAll('.delete-loan-btn').forEach(btn=>{
      btn.onclick=async()=>{
        const ref=btn.dataset.ref;
        if(!confirm(`Are you sure you want to permanently delete loan "${ref}"? This action cannot be undone.`))return;
        btn.disabled=true;
        try{
          await api('/accounts/'+btn.dataset.id,{method:'DELETE'});
          await renderLoans();
        }catch(err){
          btn.disabled=false;
          alert(err.message);
        }
      };
    });
  }
  const typeBtn=document.querySelector('#loanTypeBtn'),typeMenu=document.querySelector('#loanTypeMenu'),typeDropdown=document.querySelector('#loanTypeDropdown'),typeBtnText=document.querySelector('#loanTypeBtnText');
  const updateTypeBtnText=()=>{
    const checked=[...document.querySelectorAll('.loan-type-cb:checked')];
    if(!checked.length||checked.length===3){if(typeBtnText)typeBtnText.textContent='All types';}
    else{const labels=checked.map(cb=>cb.closest?.('label')?.querySelector?.('span')?.textContent||cb.value);if(typeBtnText)typeBtnText.textContent=labels.join(', ');}
  };
  if(typeBtn&&typeMenu&&typeDropdown){
    typeBtn.onclick=e=>{if(e&&e.stopPropagation)e.stopPropagation();const open=typeMenu.classList.toggle('hide');typeDropdown.classList.toggle('open',!open);typeBtn.setAttribute('aria-expanded',String(!open));};
    if(typeof document!=='undefined'&&document.addEventListener){
      document.addEventListener('click',e=>{if(typeDropdown&&(!typeDropdown.contains||!typeDropdown.contains(e.target))){typeMenu.classList.add('hide');typeDropdown.classList.remove('open');typeBtn.setAttribute('aria-expanded','false');}});
    }
  }
  document.querySelectorAll('.list-controls input,.list-controls select').forEach(x=>x.oninput=()=>{page=1;draw();});
  document.querySelectorAll('.loan-type-cb').forEach(cb=>{cb.onchange=()=>{updateTypeBtnText();page=1;draw();};});
  document.querySelector('#prevLoans').onclick=()=>{page--;draw();};
  document.querySelector('#nextLoans').onclick=()=>{page++;draw();};
  draw();
}
async function renderParties(params=new URLSearchParams()){
  await loadParties();const tab=['borrowers','organisations','partners'].includes(params.get('tab'))?params.get('tab'):'borrowers',id=params.get('id'),edit=params.get('edit'),add=params.has('add'),returnTo=params.get('return'),record=state.parties.find(p=>p.id===(id||edit));
  const belongs=p=>tab==='organisations'?p.kind==='ORGANIZATION'&&!/INVESTOR|MANAGER|OWNER/i.test(p.roles||''):tab==='partners'?/INVESTOR|MANAGER|OWNER/i.test(p.roles||''):p.kind==='PERSON'&&/BORROWER/i.test(p.roles||'');
  const list=state.parties.filter(belongs),tabs=['borrowers','organisations','partners'].map(t=>`<a class="${tab===t?'active':''}" href="#/parties?tab=${t}">${t[0].toUpperCase()+t.slice(1)}</a>`).join('');
  const orgOptions=options(state.parties.filter(p=>p.kind==='ORGANIZATION'&&p.active&&p.id!==record?.id),record?.organization_id||'','No linked organisation');
  const form=(add||edit)?`<section class="card directory-profile"><h2>${edit?'Edit':'Add'} ${tab==='organisations'?'organisation':tab==='partners'?'partner':'borrower'}</h2><form id="party-form"><div class="form-grid">${field('name',tab==='organisations'?'Organisation / business name':tab==='borrowers'?'Full name':'Partner name','text',record?.name||'','required')}${tab==='partners'?`<div class="field"><label for="kind">Classification</label><select id="kind" name="kind"><option value="PERSON" ${record?.kind==='PERSON'?'selected':''}>Individual</option><option value="ORGANIZATION" ${record?.kind==='ORGANIZATION'?'selected':''}>Organisation</option></select></div><div class="field"><label>Responsibilities</label><label class="inline"><input id="roleInvestor" type="checkbox" ${/INVESTOR/i.test(record?.roles||'')||(!record&&returnTo!=='manager')?'checked':''}> Capital contributor</label><label class="inline"><input id="roleManager" type="checkbox" ${/MANAGER/i.test(record?.roles||'')||(!record&&returnTo==='manager')?'checked':''}> External manager</label></div>`:''}${field('phone','Phone','tel',record?.phone||'')}${tab==='organisations'?field('contactName','Primary contact person','text',record?.contact_name||''):''}${tab==='borrowers'?`<div class="field"><label for="organizationId">Linked organisation</label><select id="organizationId" name="organizationId">${orgOptions}</select></div>`:''}${field('address','Address','text',record?.address||'')}<div class="field full"><label for="notes">Notes</label><textarea id="notes" name="notes">${esc(record?.notes||'')}</textarea></div>${edit?`<label class="inline"><input type="checkbox" name="active" ${record?.active?'checked':''}> Active</label>`:''}</div><div class="form-actions"><button class="button" type="submit">${edit?'Save changes':'Save record'}</button><a class="button secondary" href="#/parties?tab=${tab}">Cancel</a>${edit?`<button class="button danger delete-party-btn" type="button" data-id="${record.id}" data-name="${esc(record.name)}" style="margin-left:auto">Delete</button>`:''}<span class="form-error" role="alert"></span></div></form></section>`:'';
  shell('parties',`${heading('DIRECTORY','Borrowers, Organisations & Partners','Register and manage the people and businesses linked to loans.',`<a class="button" href="#/parties?tab=${tab}&add=1${returnTo?'&return='+encodeURIComponent(returnTo):''}">＋ Add ${tab==='organisations'?'organisation':tab==='partners'?'partner':'borrower'}</a>`)}<div class="directory-tabs">${tabs}</div><div class="field" style="max-width:360px;margin-bottom:18px"><label for="directorySearch">Search ${tab}</label><input id="directorySearch" type="search" placeholder="Name or phone"></div><section class="card"><div class="card-head"><h2>${tab[0].toUpperCase()+tab.slice(1)}</h2>${pill(`${list.length} records`)}</div>${list.length?`<div class="table-wrap"><table class="table directory-table"><thead><tr><th>Name</th><th>Phone</th><th>${tab==='borrowers'?'Organisation':'Type'}</th><th>Loans</th><th>Status</th><th></th></tr></thead><tbody>${list.map(p=>`<tr><td><a class="text-link" href="#/parties?tab=${tab}&id=${p.id}">${esc(p.name)}</a></td><td>${esc(p.phone||'—')}</td><td>${esc(tab==='borrowers'?p.organization_name||'—':p.kind==='PERSON'?'Individual':'Organisation')}</td><td>${p.loan_count||0}</td><td>${pill(p.active?'Active':'Inactive',p.active?'':'gray')}</td><td><a class="text-link" href="#/parties?tab=${tab}&edit=${p.id}">Edit</a> · <button class="button-link danger delete-party-btn" data-id="${p.id}" data-name="${esc(p.name)}" type="button">Delete</button></td></tr>`).join('')}</tbody></table></div>`:empty(`No ${tab} found. Add the first record.`)}</section>${form}<div id="directoryProfile"></div>`, 'Directory');
  document.querySelector('#directorySearch').oninput=ev=>{const term=ev.target.value.toLocaleLowerCase();document.querySelectorAll('.directory-table tbody tr').forEach(row=>row.classList.toggle('hide',!row.textContent.toLocaleLowerCase().includes(term)));};
  const wireDeleteParty=()=>{
    document.querySelectorAll('.delete-party-btn').forEach(btn=>{
      btn.onclick=async()=>{
        const pName=btn.dataset.name;
        if(!confirm(`Are you sure you want to permanently delete "${pName}"?`))return;
        btn.disabled=true;
        try{
          await api('/parties/'+btn.dataset.id,{method:'DELETE'});
          location.hash='#/parties?tab='+tab;
          await renderParties(params);
        }catch(err){
          btn.disabled=false;
          alert(err.message);
        }
      };
    });
  };
  wireDeleteParty();
  const f=document.querySelector('#party-form');if(f)f.onsubmit=async ev=>{ev.preventDefault();const data=Object.fromEntries(new FormData(f));data.kind=tab==='partners'?data.kind:tab==='organisations'?'ORGANIZATION':'PERSON';data.roles=tab==='partners'?[f.querySelector('#roleInvestor').checked?'INVESTOR':'',f.querySelector('#roleManager').checked?'MANAGER':''].filter(Boolean).join(','):tab==='borrowers'?'BORROWER':'BUSINESS,BORROWER';if(tab==='partners'&&!data.roles){error(f,Error('Choose at least one responsibility.'));return;}data.active=edit?f.active.checked:true;try{const saved=edit?await api('/parties/'+edit,{method:'PATCH',body:JSON.stringify(data)}):await post('/parties',data);if(returnTo){sessionStorage.setItem('newDirectorySelection',JSON.stringify({id:saved.id,role:returnTo}));location.hash='#/new';}else location.hash='#/parties?tab='+tab+'&id='+saved.id;}catch(err){error(f,err);}};
  if(id){const detail=await api('/parties/'+id);document.querySelector('#directoryProfile').innerHTML=`<section class="card directory-profile"><div class="card-head"><div><h2>${esc(detail.record.name)}</h2><p class="card-sub">${esc(detail.record.address||'')}${detail.record.notes?' · '+esc(detail.record.notes):''}</p></div><div><a class="button secondary" href="#/parties?tab=${tab}&edit=${id}">Edit</a><button class="button danger small delete-party-btn" data-id="${id}" data-name="${esc(detail.record.name)}" type="button" style="margin-left:8px">Delete</button></div></div><h2>Linked loans</h2>${detail.loans.length?`<div class="table-wrap"><table class="table"><thead><tr><th>Reference</th><th>Recorded face</th><th>Collected</th><th>Outstanding</th><th>Status</th></tr></thead><tbody>${detail.loans.map(a=>`<tr><td><a class="text-link" href="#/loans/${a.id}">${esc(a.reference)}</a></td><td class="money">${fmt(a.face_paise)}</td><td class="money">${fmt(a.collected_paise)}</td><td class="money">${fmt(a.face_paise-a.collected_paise)}</td><td>${pill(a.status)}</td></tr>`).join('')}</tbody></table></div>`:empty('No linked loans yet.')}</section>`;wireDeleteParty();}
}

async function renderNew(){
  try{await loadParties();}catch{}const people=state.parties.filter(p=>p.id!==state.me.ownerId),today=localDate();
  shell('new',`${heading('NEW ACCOUNT','Add a loan','One form for the full recorded account scope. Investor shares stay separate from the main schedule.')}
  <div class="banner">Start by adding any missing borrower, investor, or manager in <a class="text-link" href="#/parties">People & partners</a>. A loan is saved as an agreement; confirm actual funding separately on its detail page.</div>
  <form id="loan-form"><section class="card"><h2>1 · Arrangement</h2><p class="card-sub">Choose who manages the borrower and what this account records.</p><div class="form-grid"><div class="field"><label for="accountType">Account type</label><select id="accountType" name="accountType"><option value="solo">Solo · Ayyappan manages</option><option value="joint">Joint capital · Ayyappan manages</option><option value="pool">External manager · Ayyappan manages a pool</option><option value="external">External manager · Ayyappan’s own stake</option></select></div><div class="field" id="borrowerField"><label for="borrowerId">Company / Borrower</label><input class="directory-filter" type="search" data-target="borrowerId" placeholder="Search companies or borrowers"><select id="borrowerId" name="borrowerId">${borrowerSelectOptions(people)}</select><a class="text-link add-directory" data-role="borrower" href="#/parties?tab=organisations&add=1&return=borrower">＋ Add New Organisation</a> · <a class="text-link add-directory" data-role="borrower" href="#/parties?tab=borrowers&add=1&return=borrower">Add New Borrower</a></div><div class="field hide" id="managerField"><label for="managerId">External manager</label><input class="directory-filter" type="search" data-target="managerId" placeholder="Search partners"><select id="managerId" name="managerId">${options(people.filter(p=>p.active&&/MANAGER/i.test(p.roles||'')))}</select><a class="text-link add-directory" data-role="manager" href="#/parties?tab=partners&add=1&return=manager">＋ Add New Partner</a></div></div></section>
  <section class="card"><h2>2 · Financial terms</h2><p class="card-sub">Interest is deducted before cash is advanced. Face value remains the repayment obligation.</p><div class="form-grid three">${field('face','Recorded face value (₹)','text','1000000','inputmode="decimal" required')}${field('rate','Upfront discount rate (%)','text','10','inputmode="decimal" required')}${field('agreementDate','Agreement date','date',today,'required')}<div class="field full"><label for="notes">Notes</label><textarea id="notes" name="notes" placeholder="Optional context about the agreement"></textarea></div></div><div class="section-title">Instant calculation</div><div class="summary-strip"><div class="summary-item"><span>Recorded face</span><strong id="preview-face">—</strong></div><div class="summary-item"><span>Upfront interest</span><strong id="preview-interest">—</strong></div><div class="summary-item"><span>Net cash</span><strong id="preview-net">—</strong></div><div class="summary-item"><span>Expected profit</span><strong id="preview-profit">—</strong></div></div></section>
  <section class="card hide" id="partnersSection"><div class="card-head"><div><h2>3 · Investor contributions</h2><p class="card-sub">Ayyappan receives the remaining share automatically. This section is private.</p></div><button class="button secondary small" type="button" id="addPartner">＋ Add investor</button></div><div class="field"><label for="basis">Input basis for this account</label><select id="basis" name="basis"><option value="FACE_SHARE">Face-value repayment share</option><option value="NET_CASH">Actual net cash invested</option></select></div><div id="partnerRows"></div><div class="banner green" id="ownerRemainder">Ayyappan’s remainder: —</div></section>
  <section class="card"><h2>4 · Installment schedule</h2><p class="card-sub">The main schedule shows the full recorded scope, never one investor’s slice.</p><label class="inline" id="scheduleToggleWrap"><input type="checkbox" id="hasSchedule" checked> Create a dated schedule</label><div id="scheduleFields"><div class="form-grid three" style="margin-top:18px"><div class="field"><label for="scheduleMode">Build schedule by</label><select id="scheduleMode"><option value="COUNT">Installment count</option><option value="AMOUNT">Preferred amount</option><option value="MANUAL">Manual amount × count groups</option></select></div><div class="field" id="countField">${field('count','Installment count','number','10','min="1" max="1000"').replace('<div class="field">','').replace('</div>','')}</div><div class="field hide" id="amountField">${field('installmentAmount','Preferred amount (₹)','text','','inputmode="decimal"').replace('<div class="field">','').replace('</div>','')}</div>${field('firstDate','First due date','date',addDays(today,7))}${field('intervalDays','Days between installments','number','7','min="1" max="3650"')}<div class="field"><label for="weekday">Weekly day alignment</label><select id="weekday"><option value="">None · use first date</option>${['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'].map((name,i)=>`<option value="${i}">${name}</option>`).join('')}</select></div></div><div class="hide" id="groupsField"><div class="section-title">Manual groups</div><div id="groupRows"></div><button class="button secondary small" type="button" id="addGroup">＋ Add group</button></div><div class="form-actions"><button class="button secondary" type="button" id="previewSchedule">Preview schedule</button><span class="mini muted">Generate and review dates before saving.</span></div><div id="schedulePreview"></div></div></section>
  <div class="form-actions"><button class="button" type="submit">Save loan agreement →</button><a class="button secondary" href="#/loans">Cancel</a><span class="form-error" role="alert"></span></div></form>`, 'Add loan');
  const f=document.querySelector('#loan-form');
  function partnerRow(){const div=document.createElement('div');div.className='partner-row';div.innerHTML=`<div class="field"><label>Investor</label><input class="directory-filter" type="search" placeholder="Search partners"><select class="partner-id">${options(people.filter(p=>p.active&&/INVESTOR/i.test(p.roles||'')),'','Select investor')}</select><a class="text-link add-directory" data-role="partner" href="#/parties?tab=partners&add=1&return=partner">＋ Add New Partner</a></div><div class="field"><label>Amount (₹)</label><input class="partner-amount" inputmode="decimal" placeholder="e.g. 300000"></div><button class="button ghost remove-row" type="button">Remove</button>`;div.querySelector('.remove-row').onclick=()=>{div.remove();preview();};div.querySelector('.partner-amount').oninput=preview;document.querySelector('#partnerRows').append(div);}
  function groupRow(){const div=document.createElement('div');div.className='group-row';div.innerHTML=`<div class="field"><label>Amount per installment (₹)</label><input class="group-amount" inputmode="decimal" placeholder="100000"></div><div class="field"><label>Count</label><input class="group-count" type="number" min="1" placeholder="9"></div><button class="button ghost remove-row" type="button">Remove</button>`;div.querySelector('.remove-row').onclick=()=>div.remove();document.querySelector('#groupRows').append(div);}
  function conditional(resetSchedule=false){const type=f.accountType.value,ext=type==='pool'||type==='external';f.querySelector('#borrowerField').classList.toggle('hide',ext);f.querySelector('#managerField').classList.toggle('hide',!ext);f.querySelector('#partnersSection').classList.toggle('hide',type==='solo'||type==='external');f.querySelector('#scheduleToggleWrap').classList.toggle('hide',!ext);if(!ext)f.querySelector('#hasSchedule').checked=true;else if(resetSchedule)f.querySelector('#hasSchedule').checked=type==='pool';f.querySelector('#scheduleFields').classList.toggle('hide',!f.querySelector('#hasSchedule').checked);preview();}
  function scheduleConditional(){const mode=f.querySelector('#scheduleMode').value;f.querySelector('#countField').classList.toggle('hide',mode!=='COUNT');f.querySelector('#amountField').classList.toggle('hide',mode!=='AMOUNT');f.querySelector('#groupsField').classList.toggle('hide',mode!=='MANUAL');}
  function preview(){try{const face=rupees(f.face.value),rate=f.rate.value.trim();if(!/^\d{1,2}(\.\d{1,4})?$/.test(rate)||face<=0n)throw Error();const [w,p='']=rate.split('.'),numerator=BigInt(w+p),denominator=10n**BigInt(p.length),interest=(face*numerator*2n+100n*denominator)/(200n*denominator),net=face-interest;for(const [id,value] of [['preview-face',face],['preview-interest',interest],['preview-net',net],['preview-profit',interest]])f.querySelector('#'+id).textContent=fmt(value);const basis=f.basis.value,used=[...f.querySelectorAll('.partner-amount')].reduce((n,x)=>n+rupees(x.value),0n),total=basis==='NET_CASH'?net:face;f.querySelector('#ownerRemainder').textContent=`Ayyappan’s remaining ${basis==='NET_CASH'?'net cash':'face-value share'}: ${used>total?'Exceeds recorded scope':fmt(total-used)}`;}catch{for(const id of ['preview-face','preview-interest','preview-net','preview-profit'])f.querySelector('#'+id).textContent='—';}}
  f.accountType.onchange=()=>conditional(true);f.querySelector('#hasSchedule').onchange=()=>conditional(false);f.querySelector('#scheduleMode').onchange=scheduleConditional;f.face.oninput=preview;f.rate.oninput=preview;f.basis.onchange=preview;f.querySelector('#addPartner').onclick=partnerRow;f.querySelector('#addGroup').onclick=groupRow;groupRow();conditional();scheduleConditional();
  const draftRaw=sessionStorage.getItem('loanDraft');if(draftRaw){try{const draft=JSON.parse(draftRaw);for(const [key,value] of Object.entries(draft.fields)){const input=f.querySelector('#'+key);if(input){if(input.type==='checkbox')input.checked=value;else input.value=value;}}f.querySelector('#groupRows').replaceChildren();(draft.groups.length?draft.groups:[{}]).forEach(g=>{groupRow();const row=f.querySelector('.group-row:last-child');row.querySelector('.group-amount').value=g.amount||'';row.querySelector('.group-count').value=g.count||'';});draft.partners.forEach(p=>{partnerRow();const row=f.querySelector('.partner-row:last-child');row.querySelector('.partner-id').value=p.id||'';row.querySelector('.partner-amount').value=p.amount||'';});conditional();scheduleConditional();preview();}catch{sessionStorage.removeItem('loanDraft');}}
  const selectedRaw=sessionStorage.getItem('newDirectorySelection');if(selectedRaw){try{const selected=JSON.parse(selectedRaw);if(selected.role==='borrower')f.borrowerId.value=selected.id;else if(selected.role==='manager')f.managerId.value=selected.id;else if(selected.role==='partner'){if(!f.querySelector('.partner-row'))partnerRow();f.querySelector('.partner-row:last-child .partner-id').value=selected.id;}sessionStorage.removeItem('newDirectorySelection');}catch{}}
  f.addEventListener('input',ev=>{if(!ev.target.classList.contains('directory-filter'))return;const select=ev.target.nextElementSibling,term=ev.target.value.toLocaleLowerCase();[...select.options].forEach(option=>{if(option.value)option.hidden=!option.textContent.toLocaleLowerCase().includes(term);});});
  f.addEventListener('click',ev=>{const link=ev.target.closest('.add-directory');if(!link)return;const fields={};f.querySelectorAll('input[id],select[id],textarea[id]').forEach(input=>{if(!input.closest('.partner-row,.group-row'))fields[input.id]=input.type==='checkbox'?input.checked:input.value;});sessionStorage.setItem('loanDraft',JSON.stringify({fields,partners:[...f.querySelectorAll('.partner-row')].map(row=>({id:row.querySelector('.partner-id').value,amount:row.querySelector('.partner-amount').value})),groups:[...f.querySelectorAll('.group-row')].map(row=>({amount:row.querySelector('.group-amount').value,count:row.querySelector('.group-count').value}))}));});
  const scheduleValues=()=>({mode:f.querySelector('#scheduleMode').value,firstDate:f.firstDate.value,intervalDays:f.intervalDays.value,weekday:f.weekday.value,count:f.count.value,amount:f.installmentAmount.value,groups:[...f.querySelectorAll('.group-row')].map(row=>({amount:row.querySelector('.group-amount').value.trim(),count:row.querySelector('.group-count').value}))});
  let previewKey='',previewRows=[];
  f.querySelector('#previewSchedule').onclick=async()=>{try{const schedule=scheduleValues(),rows=await post('/schedule/preview',{face:f.face.value.trim(),schedule});previewKey=JSON.stringify({face:f.face.value.trim(),schedule});previewRows=rows;f.querySelector('#schedulePreview').innerHTML=`<div class="section-title">Review ${rows.length} installments · ${fmt(rows.reduce((n,r)=>n+BigInt(r.amount),0n))}</div><div class="table-wrap"><table class="table"><thead><tr><th>#</th><th>Due date · editable</th><th>Amount (₹) · editable</th></tr></thead><tbody>${rows.map((r,i)=>`<tr><td>${i+1}</td><td><input class="preview-date" type="date" data-index="${i}" value="${esc(r.date)}" aria-label="Installment ${i+1} due date"></td><td><input class="preview-amount" inputmode="decimal" data-index="${i}" value="${rawMoney(r.amount)}" aria-label="Installment ${i+1} amount"></td></tr>`).join('')}</tbody></table></div><p class="mini muted">Edited amounts must still total the recorded face value.</p>`;}catch(err){previewKey='';error(f,err);}};
  f.onsubmit=async ev=>{ev.preventDefault();const type=f.accountType.value,typeValue=type==='solo'?'SOLO_SELF_MANAGED':type==='joint'?'JOINT_SELF_MANAGED':'EXTERNAL',arrangement=type==='pool'?'MANAGED_POOL':type==='external'?'OWN_STAKE_EXTERNALLY_MANAGED':'NONE';if((type==='solo'||type==='joint')&&!f.borrowerId.value||(['pool','external'].includes(type)&&!f.managerId.value)){error(f,Error('Choose a registered company, borrower or manager before saving.'));return;}const partners=[...f.querySelectorAll('.partner-row')].map(row=>({partyId:row.querySelector('.partner-id').value,amount:row.querySelector('.partner-amount').value.trim()}));let schedule=null;if(f.querySelector('#hasSchedule').checked){schedule=scheduleValues();if(previewKey!==JSON.stringify({face:f.face.value.trim(),schedule})){error(f,Error('Preview the current schedule before saving.'));return;}schedule.overrides=previewRows.map((row,index)=>{const date=f.querySelector(`.preview-date[data-index="${index}"]`).value,amount=f.querySelector(`.preview-amount[data-index="${index}"]`).value.trim();return date!==row.date||rupees(amount)!==BigInt(row.amount)?{index,date,amount}:null;}).filter(Boolean);}try{const result=await post('/accounts',{type:typeValue,arrangement,borrowerId:!['pool','external'].includes(type)?f.borrowerId.value:null,managerId:['pool','external'].includes(type)?f.managerId.value:null,face:f.face.value.trim(),rate:f.rate.value.trim(),agreementDate:f.agreementDate.value,notes:f.notes.value,basis:f.basis.value,partners,schedule});sessionStorage.removeItem('loanDraft');location.hash='#/loans/'+result.id;}catch(err){error(f,err);}};
}

async function renderDetail(id){
  if(!state.parties||!state.parties.length){try{await loadParties();}catch{}}
  const d=await api('/accounts/'+id),a=d.account,external=a.type==='EXTERNAL',partnerRows=d.contributions.filter(c=>c.party_id!==state.me.ownerId),open=d.installments.filter(i=>i.paid_paise<i.amount_paise),isDefaulted=a.status==='DEFAULTED'||a.status==='STOPPED_PAYING';
  const installmentOptions='<option value="">Select installment</option>'+open.map(i=>`<option value="${i.id}">#${i.sequence_no} · ${esc(i.due_date)} · ${fmt(i.amount_paise-i.paid_paise)} remaining</option>`).join('');

  const headerName = a.borrower_person_name && a.organization_name
    ? `<h1>${esc(a.borrower_person_name)}</h1><div class="detail-sub-org">${esc(a.organization_name)}</div>`
    : `<h1>${esc(a.organization_name || a.borrower_person_name || a.borrower_name || a.manager_name || 'Loan account')}</h1>`;

  shell('loans',`<div class="detail-top"><div><div class="ref">${esc(a.reference)}</div>${headerName}<p class="sub">${esc(labelType(a))} · Agreement ${esc(a.agreement_date)} · ${statusPill(a)}</p></div><div class="detail-actions"><div class="status-action-wrap"><label for="accountStatusSelect" class="mini muted">Loan status:</label><select id="accountStatusSelect" class="status-select" aria-label="Change loan status"><option value="ACTIVE" ${a.status==='ACTIVE'?'selected':''}>Active</option><option value="COMPLETED" ${a.status==='COMPLETED'?'selected':''}>Completed</option><option value="DEFAULTED" ${isDefaulted?'selected':''}>Defaulted (Stopped paying)</option></select></div><button class="button secondary" id="editLoanBtn" type="button">✏️ Edit loan</button><button class="button danger" id="deleteLoanDetailBtn" type="button">🗑️ Delete loan</button><a class="button secondary" href="#/loans">← All loans</a>${!external?`<a class="button secondary" href="/api/accounts/${id}/schedule.pdf">Download borrower PDF</a>`:''}</div></div>
  ${isDefaulted?`<div class="banner" style="background:#fae3de;border-color:#e8aca3;color:#852c21;margin-top:22px"><strong>Defaulted / Stopped Paying</strong> — Borrower has completely stopped paying the debt back. Cheque collections for this loan are suspended from daily operational worklists.</div>`:a.status==='COMPLETED'?`<div class="banner green" style="margin-top:22px"><strong>Completed</strong> — This loan has been completed and fully settled.</div>`:''}
  <div class="banner ${a.funded_date?'green':''}" style="margin-top:14px">${a.funded_date?`Funding confirmed on ${esc(a.funded_date)}.`:'Agreement recorded; actual funding has not been confirmed. Capital is excluded from funded totals.'}</div>

  <section id="editLoanSection" class="card hide edit-loan-section">
    <div class="card-head">
      <div>
        <h2>Edit Loan Agreement · ${esc(a.reference)}</h2>
        <p class="card-sub">Update company/borrower, agreement terms, rate, status, or notes.</p>
      </div>
      <button class="button ghost small" type="button" id="closeEditLoanBtn">✕ Close</button>
    </div>
    <form id="edit-loan-form">
      <div class="form-grid">
        ${!external ? `
        <div class="field">
          <label for="editBorrowerId">Company / Borrower</label>
          <select id="editBorrowerId" name="borrowerId">
            ${borrowerSelectOptions(state.parties, a.borrower_id)}
          </select>
        </div>` : `
        <div class="field">
          <label for="editManagerId">External Manager</label>
          <select id="editManagerId" name="managerId">
            ${options(state.parties.filter(p=>p.active&&/MANAGER/i.test(p.roles||'')), a.manager_id)}
          </select>
        </div>`}
        ${field('agreementDate','Agreement date','date',a.agreement_date,'required')}
        ${field('rate','Discount rate (%)','text',a.rate_text,'inputmode="decimal" required')}
        ${d.receipts.length===0 ? field('face','Recorded face value (₹)','text',(a.face_paise/100).toFixed(0),'inputmode="decimal" required') : ''}
        <div class="field">
          <label for="editStatus">Status</label>
          <select id="editStatus" name="status">
            <option value="ACTIVE" ${a.status==='ACTIVE'?'selected':''}>Active</option>
            <option value="COMPLETED" ${a.status==='COMPLETED'?'selected':''}>Completed</option>
            <option value="DEFAULTED" ${isDefaulted?'selected':''}>Defaulted (Stopped paying)</option>
          </select>
        </div>
        <div class="field full">
          <label for="editNotes">Notes</label>
          <textarea id="editNotes" name="notes">${esc(a.notes||'')}</textarea>
        </div>
      </div>
      ${d.receipts.length>0 ? `<div class="banner">Payments have already been recorded on this loan (${fmt(d.collected_paise)} collected). Borrower, date, rate, status, and notes can be edited. To change face value, reverse receipts first.</div>` : ''}
      <div class="form-actions" style="margin-top:16px">
        <button class="button" type="submit">Save changes</button>
        <button class="button secondary" type="button" id="cancelEditLoanBtn">Cancel</button>
        <button class="button danger" type="button" id="deleteLoanInEditBtn" style="margin-left:auto">Delete this loan</button>
        <span class="form-error" role="alert"></span>
      </div>
    </form>
  </section>

  <div class="metrics">${metric('Amount given',fmtCompact(a.net_paise),a.funded_date?'Transfer confirmed':'Transfer not confirmed',true,fmt(a.net_paise))}${metric('Interest percentage',esc(a.rate_text)+'%','Agreed rate')}${metric('Interest to receive',fmtCompact(a.interest_paise),'Agreed interest',false,fmt(a.interest_paise))}${metric('Amount yet to be collected',fmtCompact(a.face_paise-d.collected_paise),'After payments received',false,fmt(a.face_paise-d.collected_paise))}</div>
  <div class="grid-two"><section class="card"><h2>Account details</h2><div class="table-wrap"><table class="table"><tbody><tr><td>Arrangement</td><td><strong>${esc(labelType(a))}</strong></td></tr><tr><td>Borrower Person</td><td><strong>${esc(a.borrower_person_name||'—')}</strong></td></tr><tr><td>Company / Organisation</td><td><strong>${esc(a.organization_name||'—')}</strong></td></tr><tr><td>External manager</td><td>${esc(a.manager_name||'—')}</td></tr><tr><td>Discount rate</td><td>${esc(a.rate_text)}%</td></tr><tr><td>Notes</td><td>${esc(a.notes||'—')}</td></tr></tbody></table></div></section><section class="card"><h2>Confirm capital advanced</h2><p class="card-sub">Only use this action when the net cash has actually been transferred. This does not record a repayment.</p>${a.funded_date?pill('Funding confirmed'):`<form id="fund-form"><div class="form-grid">${field('fundedDate','Actual funding date','date',localDate(),'required')}</div><div class="form-actions"><button class="button" type="submit">Confirm funding</button><span class="form-error" role="alert"></span></div></form>`}</section></div>
  <section class="card"><div class="card-head"><div><h2>Installment schedule</h2><p class="card-sub">Bank results are confirmed on the Yesterday's Cheques page. Scheduled records do not count as paid.</p></div>${pill(`${d.installments.length} installments`)}</div>${d.installments.length?`<div class="table-wrap"><table class="table"><thead><tr><th>#</th><th>Due date</th><th>Installment</th><th>Remaining</th><th>Status</th></tr></thead><tbody>${d.installments.map(i=>`<tr><td>${i.sequence_no}</td><td>${esc(i.due_date)}</td><td class="money">${fmt(i.amount_paise)}</td><td class="money">${fmt(i.amount_paise-i.paid_paise)}</td><td>${i.cheque_status==='PASSED'?pill('Passed'):i.cheque_status==='BOUNCED'?pill('Bounced','red'):i.paid_paise>=i.amount_paise?pill('Paid'):i.due_date<localDate()?pill('Awaiting result','amber'):pill('Scheduled','gray')}</td></tr>`).join('')}</tbody></table></div>`:empty('This externally managed stake has no dated installment plan.')}</section>
  <section class="card"><div class="card-head"><h2>Private investor allocation</h2><button class="button secondary small" id="toggle-allocation">Show shares</button></div><div id="allocation" class="hide"><div class="banner green">These figures belong to contributors. The borrower’s schedule above stays at full account scope.</div><div class="table-wrap"><table class="table"><thead><tr><th>Contributor</th><th>Input basis</th><th>Entered</th><th>Net capital</th><th>Face entitlement</th><th>Expected profit</th><th>Collected share</th></tr></thead><tbody>${d.contributions.map(c=>`<tr><td><strong>${esc(c.party_name)}</strong></td><td>${esc(c.input_basis)}</td><td class="money">${fmt(c.entered_paise)}</td><td class="money">${fmt(c.net_paise)}</td><td class="money">${fmt(c.face_paise)}</td><td class="money">${fmt(c.profit_paise)}</td><td class="money">${fmt(c.collected_paise)}</td></tr>`).join('')}</tbody></table></div></div></section>
  <div class="${external?'grid-two':''}">${external?`<section class="card"><h2>Record partner remittance</h2><p class="card-sub">Record confirmed money sent by the external manager.</p><form id="receipt-form"><div class="form-grid">${field('amount','Amount received (₹)','text','','inputmode="decimal" required')}<div class="field"><label for="method">Method</label><select id="method" name="method"><option>BANK_TRANSFER</option><option>CASH</option><option>OTHER</option></select></div>${d.installments.length?`<div class="field"><label for="installmentId">Installment (optional)</label><select id="installmentId" name="installmentId">${installmentOptions}</select></div>`:''}${field('receivedDate','Received date','date',localDate(),'required')}${field('reference','Payment reference','text')}</div><div class="form-actions"><button class="button">Record confirmed remittance</button><span class="form-error" role="alert"></span></div></form></section>`:''}
  <section class="card"><h2>Contributor distributions</h2><p class="card-sub">Cash sent to another investor is recorded separately from borrower or partner receipts. No due-date policy is assumed.</p>${partnerRows.length?`<form id="distribution-form"><div class="form-grid"><div class="field"><label for="contributionId">Investor</label><select id="contributionId" name="contributionId">${partnerRows.map(c=>`<option value="${c.id}">${esc(c.party_name)}</option>`).join('')}</select></div>${field('amount','Amount paid (₹)','text','','inputmode="decimal" required')}${field('paidDate','Paid date','date',localDate(),'required')}${field('reference','Transfer reference','text')}</div><div class="form-actions"><button class="button secondary">Record distribution</button><span class="form-error" role="alert"></span></div></form>`:empty('No external investors in this account.')}</section></div>
  <div class="grid-two"><section class="card"><h2>Receipt history</h2><p class="card-sub">Reversals preserve the original event and restore outstanding balances.</p>${d.receipts.length?`<div class="table-wrap"><table class="table"><thead><tr><th>Date</th><th>Source</th><th>Amount</th><th>Status</th><th></th></tr></thead><tbody>${d.receipts.map(r=>`<tr><td>${esc(r.received_date)}</td><td>${esc(r.method)}${r.sequence_no?` · #${r.sequence_no}`:''}</td><td class="money">${r.reversal_of?'-':''}${fmt(r.amount_paise)}</td><td>${pill(r.reversal_of?'Reversal':r.reversed?'Reversed':'Confirmed',r.reversal_of||r.reversed?'gray':'')}</td><td>${!r.reversal_of&&!r.reversed?`<button class="button ghost small reverse-receipt" data-id="${r.id}">Reverse</button>`:''}</td></tr>`).join('')}</tbody></table></div>`:empty('No receipts recorded.')}</section><section class="card"><h2>Distribution history</h2>${d.distributions.length?`<div class="table-wrap"><table class="table"><thead><tr><th>Date</th><th>Investor</th><th>Amount</th></tr></thead><tbody>${d.distributions.map(x=>`<tr><td>${esc(x.paid_date)}</td><td>${esc(x.party_name)}</td><td class="money">${fmt(x.amount_paise)}</td></tr>`).join('')}</tbody></table></div>`:empty('No contributor distributions recorded.')}</section></div>`, 'Loan details');

  const statusSel=document.querySelector('#accountStatusSelect');
  if(statusSel){
    statusSel.onchange=async()=>{
      const newStatus=statusSel.value;
      const label=newStatus==='COMPLETED'?'Completed':newStatus==='DEFAULTED'?'Defaulted (Stopped paying)':'Active';
      if(!confirm(`Update loan status to "${label}"?`)){statusSel.value=a.status;return;}
      statusSel.disabled=true;
      try{await post(`/accounts/${id}/status`,{status:newStatus});await renderDetail(id);}
      catch(err){statusSel.disabled=false;statusSel.value=a.status;alert(err.message);}
    };
  }

  const editBtn=document.querySelector('#editLoanBtn');
  const editSection=document.querySelector('#editLoanSection');
  const closeEdit=()=>editSection?.classList.add('hide');
  if(editBtn&&editSection){
    editBtn.onclick=()=>{
      editSection.classList.toggle('hide');
      if(!editSection.classList.contains('hide'))editSection.scrollIntoView({behavior:'smooth'});
    };
    const closeBtn=document.querySelector('#closeEditLoanBtn');if(closeBtn)closeBtn.onclick=closeEdit;
    const cancelBtn=document.querySelector('#cancelEditLoanBtn');if(cancelBtn)cancelBtn.onclick=closeEdit;
    const ef=document.querySelector('#edit-loan-form');
    if(ef){
      ef.onsubmit=async ev=>{
        ev.preventDefault();
        const data=Object.fromEntries(new FormData(ef));
        try{
          await api('/accounts/'+id,{method:'PATCH',body:JSON.stringify(data)});
          await renderDetail(id);
        }catch(err){
          error(ef,err);
        }
      };
    }
  }

  const doDeleteLoan=async()=>{
    if(!confirm(`Are you sure you want to permanently delete loan "${a.reference}"? This action cannot be undone.`))return;
    try{
      await api('/accounts/'+id,{method:'DELETE'});
      location.hash='#/loans';
    }catch(err){
      alert(err.message);
    }
  };
  const delBtn1=document.querySelector('#deleteLoanDetailBtn');if(delBtn1)delBtn1.onclick=doDeleteLoan;
  const delBtn2=document.querySelector('#deleteLoanInEditBtn');if(delBtn2)delBtn2.onclick=doDeleteLoan;

  document.querySelector('#toggle-allocation').onclick=ev=>{const box=document.querySelector('#allocation');box.classList.toggle('hide');ev.currentTarget.textContent=box.classList.contains('hide')?'Show shares':'Hide shares';};
  const fundForm=document.querySelector('#fund-form');if(fundForm)fundForm.onsubmit=async ev=>{ev.preventDefault();try{await post(`/accounts/${id}/fund`,{fundedDate:fundForm.fundedDate.value});await renderDetail(id);}catch(err){error(fundForm,err);}};
  const receiptForm=document.querySelector('#receipt-form');if(receiptForm)receiptForm.onsubmit=async ev=>{ev.preventDefault();try{await post(`/accounts/${id}/receipts`,{amount:receiptForm.elements.namedItem('amount').value.trim(),method:receiptForm.elements.namedItem('method').value,installmentId:receiptForm.elements.namedItem('installmentId')?.value||null,receivedDate:receiptForm.elements.namedItem('receivedDate').value,reference:receiptForm.elements.namedItem('reference').value});await renderDetail(id);}catch(err){error(receiptForm,err);}};
  const distributionForm=document.querySelector('#distribution-form');if(distributionForm)distributionForm.onsubmit=async ev=>{ev.preventDefault();try{await post(`/accounts/${id}/distributions`,{contributionId:distributionForm.contributionId.value,amount:distributionForm.amount.value.trim(),paidDate:distributionForm.paidDate.value,reference:distributionForm.reference.value});await renderDetail(id);}catch(err){error(distributionForm,err);}};
  document.querySelectorAll('.reverse-receipt').forEach(b=>b.onclick=async()=>{const reason=prompt('Reason for reversing this receipt:');if(!reason)return;try{await post(`/receipts/${b.dataset.id}/reverse`,{reason,receivedDate:localDate()});await renderDetail(id);}catch(err){alert(err.message);}});
}

async function renderAudit(){const rows=await api('/audit');shell('audit',`${heading('RECORD HISTORY','Activity','Recent financial and account actions. Corrections are added as events.')}
  <section class="card"><h2>Recent events</h2><div class="timeline">${rows.length?rows.map(x=>`<div class="timeline-item"><strong>${esc(x.action)} · ${esc(x.entity)}</strong><span class="mini">${esc(x.detail||x.entity_id)}</span><br><small>${esc(x.created_at)} · ${esc(x.username)}</small></div>`).join(''):empty('No activity yet.')}</div></section>`, 'Activity');}
async function route(){if(!state.me)return;const [path,query='']=(location.hash.replace(/^#\/?/,'')||'business').split('?'),parts=path.split('/'),params=new URLSearchParams(query);try{if(parts[0]==='business')await renderBusiness();else if(parts[0]==='personal')await renderPersonal();else if(parts[0]==='cheques'&&['today','yesterday','older','followup','upcoming'].includes(parts[1]))await renderCheques(parts[1],params.get('date')||undefined);else if(parts[0]==='loans'&&parts[1])await renderDetail(parts[1]);else if(parts[0]==='loans')await renderLoans();else if(parts[0]==='new')await renderNew();else if(parts[0]==='parties')await renderParties(params);else if(parts[0]==='audit')await renderAudit();else location.hash='#/business';}catch(err){app.innerHTML=`<div class="loading"><div><h2>Unable to load this page</h2><p>${esc(err.message)}</p><a class="button" href="#/business">Dashboard</a></div></div>`;}}
async function init(){try{const me=await api('/me');if(me.setup||me.login){state.me=null;loginPage(!!me.setup);}else{state.me=me;await route();if(typeof setTimeout!=='undefined'){setTimeout(()=>{prefetch('/dashboard/business');prefetch('/cheques?view=today');prefetch('/cheques?view=yesterday');prefetch('/accounts');prefetch('/parties');},80);}}}catch(err){app.innerHTML=`<div class="loading">${esc(err.message)}</div>`;}}
window.addEventListener('hashchange',route);init();
