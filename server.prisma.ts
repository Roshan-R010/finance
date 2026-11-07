import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { randomBytes, scryptSync, timingSafeEqual, createHash } from 'node:crypto';
import { one, all, run, transaction } from './src/prisma-db.ts';
import { db, uuid, now, today, fail, date, str, optional, money, num, audit, idempotent, scheduleInput, createAccount, updateAccount, deleteAccount, deleteParty, accountView, recordReceipt, reverseReceipt, businessDashboard, personalDashboard, chequeList, confirmChequeResult } from './src/service.prisma.ts';
import { makePdf } from './src/pdf.ts';
import { chequeDepositPdf } from './src/cheque-pdf.ts';
import { externalManagerRules } from './src/external-managers.ts';
import { cashSummary, openCash, addCashFund, postDistributionCash } from './src/cash.prisma.ts';
import { businessAnalytics } from './src/business-analytics.ts';

const asset=(name:string)=>new URL(`./public/${name}`,import.meta.url);
const devMode=process.env.npm_lifecycle_event==='dev';
const attempts=new Map<string,{count:number;until:number}>();
const digest=(value:string)=>createHash('sha256').update(value).digest('hex');
const passHash=(value:string)=>{const salt=randomBytes(16).toString('hex');return `${salt}:${scryptSync(value,salt,64).toString('hex')}`;};
const passCheck=(value:string,stored:string)=>{const [salt,key]=stored.split(':');if(!salt||!key)return false;const a=scryptSync(value,salt,64),b=Buffer.from(key,'hex');return a.length===b.length&&timingSafeEqual(a,b);};
function respond(res:ServerResponse,status:number,value:any){res.writeHead(status,{'content-type':'application/json; charset=utf-8','cache-control':'no-store'});res.end(JSON.stringify(value));}
function cookie(req:IncomingMessage,name:string){const pair=(req.headers.cookie||'').split(';').map(s=>s.trim()).find(s=>s.startsWith(name+'='));return pair?pair.slice(name.length+1):'';}

let isConfigured: boolean | null = null;
const sessionCache = new Map<string, { user_id: string; csrf_token: string; username: string; expires_at: string; cached_at: number }>();
const SESSION_CACHE_TTL = 120_000; // 2 minutes

async function auth(req:IncomingMessage){
  const token=cookie(req,'session');
  if(!token)fail('Sign in required.',401);
  const tokenHash=digest(token);
  const nowMs=Date.now();
  const cached=sessionCache.get(tokenHash);
  if(cached&&(nowMs-cached.cached_at<SESSION_CACHE_TTL)&&new Date(cached.expires_at).getTime()>nowMs){
    return {user_id:cached.user_id,csrf_token:cached.csrf_token,username:cached.username};
  }
  const session=await one(db,'SELECT s.user_id,s.csrf_token,u.username,s.expires_at FROM sessions s JOIN users u ON u.id=s.user_id WHERE s.token_hash=? AND s.expires_at>?',tokenHash,now());
  if(!session){sessionCache.delete(tokenHash);fail('Session expired. Sign in again.',401);}
  sessionCache.set(tokenHash,{user_id:session.user_id,csrf_token:session.csrf_token,username:session.username,expires_at:session.expires_at,cached_at:nowMs});
  return session;
}

const queryCache=new Map<string,{data:any;time:number}>();
const QUERY_CACHE_TTL=30_000; // 30 seconds

async function cachedQuery<T>(key:string,fn:()=>Promise<T>):Promise<T>{
  const cached=queryCache.get(key);
  if(cached&&(Date.now()-cached.time<QUERY_CACHE_TTL))return cached.data;
  const data=await fn();
  queryCache.set(key,{data,time:Date.now()});
  return data;
}

function invalidateCache(){queryCache.clear();}

const staticFiles:Record<string,string>={'/styles.css':'text/css','/responsive.css':'text/css','/design.css':'text/css','/yesterday.css':'text/css','/today.css':'text/css','/new-loan.css':'text/css','/dashboard.css':'text/css','/app.js':'text/javascript'};
const assetCache=new Map<string,{content:Buffer|string;etag:string;mtimeMs:number}>();

async function loadStaticAsset(name:string,isText=false){
  const filePath=asset(name);
  const s=await stat(filePath);
  const cached=assetCache.get(name);
  if(cached&&(!devMode||cached.mtimeMs===s.mtimeMs))return cached;
  const raw=await readFile(filePath);
  const content=isText?raw.toString('utf8'):raw;
  const etag=`"${createHash('md5').update(raw).digest('hex')}"`;
  const entry={content,etag,mtimeMs:s.mtimeMs};
  assetCache.set(name,entry);
  return entry;
}

async function readBody(req:IncomingMessage){let text='';for await(const chunk of req){text+=chunk;if(text.length>128000)fail('Request too large.',413);}try{return JSON.parse(text||'{}');}catch{fail('Invalid JSON.');}}
function checkOrigin(req:IncomingMessage){const origin=req.headers.origin;if(origin&&origin!==`http://${req.headers.host}`&&origin!==`https://${req.headers.host}`)fail('Origin rejected.',403);}
function pdf(res:ServerResponse,lines:string[],filename:string){res.writeHead(200,{'content-type':'application/pdf','content-disposition':`attachment; filename="${filename}"`,'cache-control':'no-store'});res.end(makePdf(lines));}

async function handle(req:IncomingMessage,res:ServerResponse){
  const url=new URL(req.url||'/',`http://${req.headers.host||'localhost'}`),path=url.pathname;
  if(req.method==='GET'&&path==='/'){
    const item=await loadStaticAsset('index.html',true);
    let html=item.content as string;
    if(devMode)html=html.replace('</body>','<script src="/dev.js"></script></body>');
    res.writeHead(200,{'content-type':'text/html; charset=utf-8','cache-control':'no-cache'});
    res.end(html);
    return;
  }
  if(devMode&&req.method==='GET'&&path==='/dev.js'){res.writeHead(200,{'content-type':'text/javascript; charset=utf-8','cache-control':'no-store'});res.end(`let revision;setInterval(async()=>{try{const r=await fetch('/__dev/revision',{cache:'no-store'});const v=await r.text();if(revision&&revision!==v)location.reload();revision=v;}catch{}},1000);`);return;}
  if(devMode&&req.method==='GET'&&path==='/__dev/revision'){const files=['index.html','styles.css','responsive.css','design.css','yesterday.css','today.css','new-loan.css','app.js'];const stamps=await Promise.all(files.map(f=>stat(asset(f)).then(x=>x.mtimeMs)));res.writeHead(200,{'content-type':'text/plain; charset=utf-8','cache-control':'no-store'});res.end(String(Math.max(...stamps)));return;}
  if(req.method==='GET'&&staticFiles[path]){
    const item=await loadStaticAsset(path.slice(1));
    if(req.headers['if-none-match']===item.etag){res.writeHead(304);res.end();return;}
    res.writeHead(200,{'content-type':staticFiles[path]+'; charset=utf-8','etag':item.etag,'cache-control':devMode?'no-cache':'public, max-age=3600, stale-while-revalidate=86400'});
    res.end(item.content);
    return;
  }
  if(!path.startsWith('/api/'))fail('Not found.',404);
  if(req.method!=='GET')checkOrigin(req);
  if(req.method==='GET'&&path==='/api/me'){
    if(isConfigured===null){const u=await one(db,'SELECT id FROM users LIMIT 1');isConfigured=!!u;}
    if(!isConfigured)return respond(res,200,{setup:true});
    try{const user=await auth(req);return respond(res,200,{username:user.username,ownerId:user.user_id,csrf:user.csrf_token});}
    catch{return respond(res,200,{login:true});}
  }
  if(req.method==='POST'&&path==='/api/setup'){
    if(isConfigured||await one(db,'SELECT id FROM users LIMIT 1')){isConfigured=true;fail('Already configured.',403);}
    if(!['127.0.0.1','::1','::ffff:127.0.0.1'].includes(req.socket.remoteAddress||''))fail('Initial setup is local-only.',403);
    const data=await readBody(req),username=str(data.username,'a username',80),password=str(data.password,'a password',200);
    if(password.length<12)fail('Use at least 12 characters for the password.');
    const id=uuid();await transaction(db,async()=>{await run(db,'INSERT INTO parties (id,name,kind,roles,phone,notes,created_at) VALUES (?,?,?,?,?,?,?)',id,'Ayyappan','PERSON','OWNER,INVESTOR','','',now());await run(db,'INSERT INTO users VALUES (?,?,?,?)',id,username,passHash(password),now());await audit(id,'user',id,'created');});
    isConfigured=true;invalidateCache();
    return respond(res,201,{ok:true});
  }
  if(req.method==='POST'&&path==='/api/login'){
    const data=await readBody(req),username=str(data.username,'a username',80),password=str(data.password,'a password',200);
    const key=req.socket.remoteAddress||'local',prior=attempts.get(key);
    if(prior&&prior.count>=5&&prior.until>Date.now())fail('Too many attempts. Try again later.',429);
    const user=await one(db,'SELECT * FROM users WHERE username=?',username);
    if(!user||!passCheck(password,user.password_hash)){attempts.set(key,{count:(prior?.count||0)+1,until:Date.now()+15*60000});fail('Invalid credentials.',401);}
    attempts.delete(key);const token=randomBytes(32).toString('hex'),csrf=randomBytes(24).toString('hex');
    const expiresAt=new Date(Date.now()+7*86400000).toISOString();
    await run(db,'INSERT INTO sessions VALUES (?,?,?,?)',digest(token),user.id,csrf,expiresAt);
    sessionCache.set(digest(token),{user_id:user.id,csrf_token:csrf,username:user.username,expires_at:expiresAt,cached_at:Date.now()});
    const secure=(req.socket as any).encrypted?'; Secure':'';
    res.setHeader('set-cookie',`session=${token}; HttpOnly; SameSite=Strict; Path=/; Max-Age=604800${secure}`);
    return respond(res,200,{ok:true});
  }
  const user=await auth(req);
  if(req.method!=='GET'&&req.headers['x-csrf-token']!==user.csrf_token)fail('Session validation failed.',403);
  const actor=user.user_id;
  if(req.method==='POST'&&path==='/api/logout'){
    const tokenHash=digest(cookie(req,'session'));
    sessionCache.delete(tokenHash);
    await run(db,'DELETE FROM sessions WHERE token_hash=?',tokenHash);
    res.setHeader('set-cookie','session=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0');
    return respond(res,200,{ok:true});
  }
  if(req.method==='GET'&&path==='/api/external-managers'){
    const rules=externalManagerRules();
    const registered=await all(db,"SELECT id,name FROM parties WHERE active=true AND roles ILIKE '%MANAGER%' AND id IN (?,?)",...rules.map(rule=>rule.id));
    return respond(res,200,rules.flatMap(rule=>{const party=registered.find(row=>row.id===rule.id);return party?[{...rule,name:party.name}]:[];}));
  }
  if(req.method==='GET'&&path==='/api/parties')return respond(res,200,await cachedQuery('parties',()=>all(db,`SELECT p.*,o.name organization_name,(SELECT COUNT(*) FROM accounts a WHERE a.borrower_id=p.id OR a.manager_id=p.id OR EXISTS(SELECT 1 FROM contributions c WHERE c.account_id=a.id AND c.party_id=p.id) OR EXISTS(SELECT 1 FROM parties member WHERE member.id=a.borrower_id AND member.organization_id=p.id)) loan_count FROM parties p LEFT JOIN parties o ON o.id=p.organization_id ORDER BY p.name`)));
  if(req.method==='POST'&&path==='/api/schedule/preview'){const data=await readBody(req);return respond(res,200,scheduleInput(data,money(data.face),true));}
  const party=path.match(/^\/api\/parties\/([a-f0-9-]+)$/);
  if(req.method==='GET'&&party){
    return respond(res,200,await cachedQuery(`party:${party[1]}`,async()=>{
      const record=await one(db,'SELECT p.*,o.name organization_name FROM parties p LEFT JOIN parties o ON o.id=p.organization_id WHERE p.id=?',party[1]);
      if(!record)fail('Directory record not found.',404);
      const loans=await all(db,`SELECT a.id,a.reference,a.type,a.face_paise,a.status,COALESCE((SELECT SUM(CASE WHEN r.reversal_of IS NULL THEN r.amount_paise ELSE -r.amount_paise END) FROM receipts r WHERE r.account_id=a.id),0) collected_paise FROM accounts a WHERE a.borrower_id=? OR a.manager_id=? OR EXISTS(SELECT 1 FROM contributions c WHERE c.account_id=a.id AND c.party_id=?) OR EXISTS(SELECT 1 FROM parties member WHERE member.id=a.borrower_id AND member.organization_id=?) ORDER BY a.created_at DESC`,party[1],party[1],party[1],party[1]);
      return {record,loans};
    }));
  }
  if(req.method==='POST'&&path==='/api/parties'){
    const data=await readBody(req);return respond(res,201,await idempotent(req.headers['idempotency-key'] as string,actor,async()=>{
      const id=uuid(),name=str(data.name,'a name',120),kind=data.kind==='ORGANIZATION'?'ORGANIZATION':'PERSON';
      if(!data.allowSameName&&await one(db,'SELECT id FROM parties WHERE lower(trim(name))=lower(trim(?)) AND kind=?',name,kind))fail('A similar name already exists. Check the directory, or confirm that this is a different record.');
      const organizationId=data.organizationId||null;
      if(organizationId){const org=await one(db,"SELECT id FROM parties WHERE id=? AND kind='ORGANIZATION' AND active=true",organizationId);if(!org)fail('Choose an active organisation.');}
      await run(db,'INSERT INTO parties (id,name,kind,roles,phone,notes,created_at,address,contact_name,active,organization_id) VALUES (?,?,?,?,?,?,?,?,?,?,?)',id,name,kind,optional(data.roles,100),optional(data.phone,50),optional(data.notes),now(),optional(data.address,500),optional(data.contactName,120),true,organizationId);
      await audit(actor,'party',id,'created',name);
      invalidateCache();
      return{id};
    }));
  }
  if(req.method==='PATCH'&&party){
    const data=await readBody(req);return respond(res,200,await idempotent(req.headers['idempotency-key'] as string,actor,async()=>{
      const old=await one(db,'SELECT * FROM parties WHERE id=?',party[1]);if(!old)fail('Directory record not found.',404);
      const name=data.name===undefined?old.name:str(data.name,'a name',120),organizationId=data.organizationId===undefined?old.organization_id:(data.organizationId||null);
      if(organizationId){if(organizationId===party[1])fail('An organisation cannot link to itself.');const org=await one(db,"SELECT id FROM parties WHERE id=? AND kind='ORGANIZATION' AND active=true",organizationId);if(!org)fail('Choose an active organisation.');}
      if(name!==old.name&&!data.allowSameName&&await one(db,'SELECT id FROM parties WHERE lower(trim(name))=lower(trim(?)) AND kind=? AND id<>?',name,old.kind,party[1]))fail('A similar name already exists. Check the directory first.');
      await run(db,'UPDATE parties SET name=?,roles=?,phone=?,notes=?,address=?,contact_name=?,active=?,organization_id=? WHERE id=?',name,data.roles===undefined?old.roles:optional(data.roles,100),data.phone===undefined?old.phone:optional(data.phone,50),data.notes===undefined?old.notes:optional(data.notes),data.address===undefined?old.address:optional(data.address,500),data.contactName===undefined?old.contact_name:optional(data.contactName,120),data.active===undefined?old.active:!!data.active,organizationId,party[1]);
      await audit(actor,'party',party[1],'updated',name);
      invalidateCache();
      return{id:party[1]};
    }));
  }
  if(req.method==='DELETE'&&party){
    return respond(res,200,await idempotent(req.headers['idempotency-key'] as string,actor,async()=>{
      const result=await deleteParty(party[1],actor);
      invalidateCache();
      return result;
    }));
  }
  if(req.method==='GET'&&path==='/api/accounts')return respond(res,200,await cachedQuery('accounts',()=>all(db,`SELECT a.id,a.reference,a.type,a.arrangement,a.face_paise,a.interest_paise,a.net_paise,a.funded_date,a.status,a.agreement_date,a.rate_text,a.notes,a.borrower_id,a.manager_id,a.contact_name,
    CASE WHEN b.kind = 'PERSON' THEN b.name ELSE '' END AS borrower_person_name,
    CASE WHEN b.kind = 'ORGANIZATION' THEN b.name ELSE o.name END AS organization_name,
    COALESCE(o.name,b.name) borrower_name,
    m.name manager_name,
    COALESCE((SELECT SUM(CASE WHEN r.reversal_of IS NULL THEN r.amount_paise ELSE -r.amount_paise END) FROM receipts r WHERE r.account_id=a.id),0) collected_paise,
    (SELECT COUNT(*) FROM receipts r WHERE r.account_id=a.id AND r.reversal_of IS NULL) receipt_count,
    schedule.next_due_date,schedule.installments_left,schedule.missed_count
    FROM accounts a
    LEFT JOIN parties b ON b.id=a.borrower_id
    LEFT JOIN parties o ON o.id=b.organization_id
    LEFT JOIN parties m ON m.id=a.manager_id
    LEFT JOIN LATERAL (
      SELECT MIN(due_date) FILTER (WHERE paid_paise<amount_paise) next_due_date,
        COUNT(*) FILTER (WHERE paid_paise<amount_paise) installments_left,
        COUNT(*) FILTER (WHERE paid_paise<amount_paise AND due_date<?) missed_count
      FROM (
        SELECT i.due_date,i.amount_paise,
          COALESCE((SELECT SUM(CASE WHEN r.reversal_of IS NULL THEN r.amount_paise ELSE -r.amount_paise END)
            FROM receipts r WHERE r.installment_id=i.id),0) paid_paise
        FROM installments i WHERE i.account_id=a.id
      ) scheduled
    ) schedule ON true
    ORDER BY a.created_at DESC`,today())));
  if(req.method==='POST'&&path==='/api/accounts'){
    const data=await readBody(req);return respond(res,201,await idempotent(req.headers['idempotency-key'] as string,actor,async()=>{
      const result=await createAccount(data,actor);
      invalidateCache();
      return result;
    }));
  }
  const account=path.match(/^\/api\/accounts\/([a-f0-9-]+)$/);
  if(req.method==='GET'&&account)return respond(res,200,await cachedQuery(`account:${account[1]}`,()=>accountView(account[1])));
  if((req.method==='PATCH'||req.method==='PUT')&&account){
    const data=await readBody(req);
    return respond(res,200,await idempotent(req.headers['idempotency-key'] as string,actor,async()=>{
      const result=await updateAccount(account[1],data,actor);
      invalidateCache();
      return result;
    }));
  }
  if(req.method==='DELETE'&&account){
    return respond(res,200,await idempotent(req.headers['idempotency-key'] as string,actor,async()=>{
      const result=await deleteAccount(account[1],actor);
      invalidateCache();
      return result;
    }));
  }
  const fund=path.match(/^\/api\/accounts\/([a-f0-9-]+)\/fund$/);
  if(req.method==='POST'&&fund){const data=await readBody(req),result=await idempotent(req.headers['idempotency-key'] as string,actor,async()=>{const a=await one(db,'SELECT funded_date FROM accounts WHERE id=?',fund[1]);if(!a)fail('Loan not found.',404);if(a.funded_date)fail('Funding already confirmed.');await run(db,'UPDATE accounts SET funded_date=?,updated_at=? WHERE id=?',date(data.fundedDate),now(),fund[1]);await audit(actor,'account',fund[1],'funded');invalidateCache();return{ok:true};});return respond(res,200,result);}
  const accountStatus=path.match(/^\/api\/accounts\/([a-f0-9-]+)\/status$/);
  if((req.method==='POST'||req.method==='PATCH')&&accountStatus){
    const data=await readBody(req);
    return respond(res,200,await idempotent(req.headers['idempotency-key'] as string,actor,async()=>{
      const a=await one(db,'SELECT id,status FROM accounts WHERE id=?',accountStatus[1]);
      if(!a)fail('Loan not found.',404);
      const rawStatus=str(data.status,'a status',50).toUpperCase();
      const validStatuses:Record<string,string>={'ACTIVE':'ACTIVE','COMPLETED':'COMPLETED','DEFAULTED':'DEFAULTED','STOPPED_PAYING':'DEFAULTED'};
      const status=validStatuses[rawStatus];
      if(!status)fail('Status must be ACTIVE, COMPLETED, or DEFAULTED.');
      await run(db,'UPDATE accounts SET status=?,updated_at=? WHERE id=?',status,now(),accountStatus[1]);
      await audit(actor,'account',accountStatus[1],'status_changed',status);
      invalidateCache();
      return{id:accountStatus[1],status};
    }));
  }
  if(req.method==='GET'&&path==='/api/cheques')return respond(res,200,await cachedQuery(`cheques:${url.searchParams.get('view')||'today'}:${url.searchParams.get('date')||''}:${url.searchParams.get('to')||''}`,()=>chequeList(url.searchParams.get('view')||'today',url.searchParams.get('date')||undefined,url.searchParams.get('to')||undefined)));
  if(req.method==='GET'&&path==='/api/cheques/today.pdf'){
    const report=await chequeList('today',url.searchParams.get('date')||undefined,url.searchParams.get('to')||undefined);
    res.writeHead(200,{'content-type':'application/pdf','content-disposition':`attachment; filename="cheques-to-deposit-${report.date}${report.endDate!==report.date?'-to-'+report.endDate:''}.pdf"`,'cache-control':'no-store'});
    res.end(chequeDepositPdf(report));return;
  }
  const chequeResult=path.match(/^\/api\/cheques\/([a-f0-9-]+)\/result$/);
  if(req.method==='POST'&&chequeResult){const data=await readBody(req);return respond(res,200,await idempotent(req.headers['idempotency-key'] as string,actor,async()=>{const result=await confirmChequeResult(chequeResult[1],data.status,actor);invalidateCache();return result;}));}
  const receipt=path.match(/^\/api\/accounts\/([a-f0-9-]+)\/receipts$/);
  if(req.method==='POST'&&receipt){const data=await readBody(req);return respond(res,201,await idempotent(req.headers['idempotency-key'] as string,actor,async()=>{const result=await recordReceipt(data,receipt[1],actor);invalidateCache();return result;}));}
  const reversal=path.match(/^\/api\/receipts\/([a-f0-9-]+)\/reverse$/);
  if(req.method==='POST'&&reversal){const data=await readBody(req);return respond(res,200,await idempotent(req.headers['idempotency-key'] as string,actor,async()=>{const result=await reverseReceipt(reversal[1],data,actor);invalidateCache();return result;}));}
  const distribution=path.match(/^\/api\/accounts\/([a-f0-9-]+)\/distributions$/);
  if(req.method==='POST'&&distribution){const data=await readBody(req),result=await idempotent(req.headers['idempotency-key'] as string,actor,async()=>{const c=await one(db,'SELECT * FROM contributions WHERE id=? AND account_id=? AND party_id<>?',data.contributionId,distribution[1],actor);if(!c)fail('Choose an external investor.');const amount=num(money(data.amount)),paid=(await one(db,'SELECT COALESCE(SUM(amount_paise),0) total FROM distributions WHERE contribution_id=?',c.id)).total;if(amount<=0||amount>c.face_paise-paid)fail('Distribution exceeds investor entitlement.');const id=uuid(),paidDate=date(data.paidDate);await run(db,'INSERT INTO distributions VALUES (?,?,?,?,?,?,?)',id,distribution[1],c.id,amount,paidDate,optional(data.reference,120),now());await postDistributionCash(id,distribution[1],c.party_id,amount,paidDate,actor);await audit(actor,'distribution',id,'recorded');invalidateCache();return{id};});return respond(res,201,result);}
  if(req.method==='GET'&&path==='/api/dashboard/business')return respond(res,200,await cachedQuery('dashboard:business',()=>businessDashboard()));
  if(req.method==='GET'&&path==='/api/dashboard/business/analytics'){
    const mode=url.searchParams.get('period')||'current',start=url.searchParams.get('start')||undefined,end=url.searchParams.get('end')||undefined;
    return respond(res,200,await cachedQuery(`dashboard:analytics:${mode}:${start||''}:${end||''}`,()=>businessAnalytics(mode,today(),start,end)));
  }
  if(req.method==='GET'&&path==='/api/dashboard/personal')return respond(res,200,await cachedQuery(`dashboard:personal:${actor}`,()=>personalDashboard(actor)));
  if(req.method==='GET'&&path==='/api/cash')return respond(res,200,await cachedQuery(`cash:${actor}`,()=>cashSummary(actor)));
  if(req.method==='POST'&&path==='/api/cash/opening'){
    const data=await readBody(req);
    return respond(res,201,await idempotent(req.headers['idempotency-key'] as string,actor,async()=>{const result=await openCash(data,actor);invalidateCache();return result;}));
  }
  if(req.method==='POST'&&path==='/api/cash/funds'){
    const data=await readBody(req);
    return respond(res,201,await idempotent(req.headers['idempotency-key'] as string,actor,async()=>{const result=await addCashFund(data,actor);invalidateCache();return result;}));
  }
  if(req.method==='GET'&&path==='/api/audit')return respond(res,200,await cachedQuery('audit',()=>all(db,'SELECT a.*,u.username FROM audit_events a JOIN users u ON u.id=a.actor_id ORDER BY a.created_at DESC LIMIT 100')));
  const schedulePdf=path.match(/^\/api\/accounts\/([a-f0-9-]+)\/schedule.pdf$/);
  if(req.method==='GET'&&schedulePdf){const v=await accountView(schedulePdf[1]);if(v.account.type==='EXTERNAL')fail('Borrower schedules are for self-managed loans only.');const amount=(paise:number)=>'INR '+new Intl.NumberFormat('en-IN',{minimumFractionDigits:2,maximumFractionDigits:2}).format(paise/100);const displayDate=(value:string)=>{const [year,month,day]=value.split('-');return `${day} ${['JAN','FEB','MAR','APR','MAY','JUN','JUL','AUG','SEP','OCT','NOV','DEC'][Number(month)-1]} ${year.slice(-2)}`;};return pdf(res,[`Repayment schedule - ${v.account.reference}`,`Borrower: ${v.account.borrower_name}`,`Agreement date: ${displayDate(v.account.agreement_date)}`,`Total to repay: ${amount(v.account.face_paise)}`,'',...v.installments.map(i=>`${i.sequence_no}.  ${displayDate(i.due_date)}    ${amount(i.amount_paise)}`)],`${v.account.reference}-schedule.pdf`);}
  fail('Not found.',404);
}
export function startServer(port=Number(process.env.PORT||3000),host=process.env.HOST||'127.0.0.1'){
  if(!['127.0.0.1','::1'].includes(host))throw Error('This local build only binds to loopback. Configure the hosted adapter and security gates before public deployment.');
  const server=createServer((req,res)=>{
    res.setHeader('x-content-type-options','nosniff');
    res.setHeader('referrer-policy','no-referrer');
    res.setHeader('x-frame-options','DENY');
    res.setHeader('content-security-policy',"default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com; img-src 'self' data:; connect-src 'self'; object-src 'none'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'");
    handle(req,res).catch((error:any)=>{if(res.headersSent){res.end();return;}respond(res,error.status||400,{error:error.message||'Request failed.'});});
  });
  return server.listen(port,host,()=>console.log(`Finance app: http://${host}:${(server.address() as any).port}`));
}
if(process.env.NODE_ENV!=='test')startServer();
