import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { randomBytes, scryptSync, timingSafeEqual, createHash } from 'node:crypto';
import { one, all, run, transaction } from './src/db.ts';
import { db, uuid, now, today, fail, date, str, optional, money, num, audit, idempotent, scheduleInput, createAccount, accountView, recordReceipt, reverseReceipt, businessDashboard, personalDashboard, tomorrowCheques } from './src/service.ts';
import { makePdf } from './src/pdf.ts';

const asset=(name:string)=>new URL(`./public/${name}`,import.meta.url);
const devMode=process.env.npm_lifecycle_event==='dev';
const attempts=new Map<string,{count:number;until:number}>();
const digest=(value:string)=>createHash('sha256').update(value).digest('hex');
const passHash=(value:string)=>{const salt=randomBytes(16).toString('hex');return `${salt}:${scryptSync(value,salt,64).toString('hex')}`;};
const passCheck=(value:string,stored:string)=>{const [salt,key]=stored.split(':');if(!salt||!key)return false;const a=scryptSync(value,salt,64),b=Buffer.from(key,'hex');return a.length===b.length&&timingSafeEqual(a,b);};
function respond(res:ServerResponse,status:number,value:any){res.writeHead(status,{'content-type':'application/json; charset=utf-8','cache-control':'no-store'});res.end(JSON.stringify(value));}
function cookie(req:IncomingMessage,name:string){const pair=(req.headers.cookie||'').split(';').map(s=>s.trim()).find(s=>s.startsWith(name+'='));return pair?pair.slice(name.length+1):'';}
function auth(req:IncomingMessage){const token=cookie(req,'session');if(!token)fail('Sign in required.',401);const session=one(db,'SELECT s.user_id,s.csrf_token,u.username FROM sessions s JOIN users u ON u.id=s.user_id WHERE s.token_hash=? AND s.expires_at>?',digest(token),now());if(!session)fail('Session expired. Sign in again.',401);return session;}
async function readBody(req:IncomingMessage){let text='';for await(const chunk of req){text+=chunk;if(text.length>128000)fail('Request too large.',413);}try{return JSON.parse(text||'{}');}catch{fail('Invalid JSON.');}}
function checkOrigin(req:IncomingMessage){const origin=req.headers.origin;if(origin&&origin!==`http://${req.headers.host}`&&origin!==`https://${req.headers.host}`)fail('Origin rejected.',403);}
function pdf(res:ServerResponse,lines:string[],filename:string){res.writeHead(200,{'content-type':'application/pdf','content-disposition':`attachment; filename="${filename}"`,'cache-control':'no-store'});res.end(makePdf(lines));}

async function handle(req:IncomingMessage,res:ServerResponse){
  const path=new URL(req.url||'/',`http://${req.headers.host||'localhost'}`).pathname;
  if(req.method==='GET'&&path==='/'){let html=await readFile(asset('index.html'),'utf8');if(devMode)html=html.replace('</body>','<script src="/dev.js"></script></body>');res.writeHead(200,{'content-type':'text/html; charset=utf-8','cache-control':'no-store'});res.end(html);return;}
  if(devMode&&req.method==='GET'&&path==='/dev.js'){res.writeHead(200,{'content-type':'text/javascript; charset=utf-8','cache-control':'no-store'});res.end(`let revision;setInterval(async()=>{try{const r=await fetch('/__dev/revision',{cache:'no-store'});const v=await r.text();if(revision&&revision!==v)location.reload();revision=v;}catch{}},1000);`);return;}
  if(devMode&&req.method==='GET'&&path==='/__dev/revision'){const files=['index.html','styles.css','responsive.css','design.css','yesterday.css','today.css','new-loan.css','app.js'];const stamps=await Promise.all(files.map(f=>stat(asset(f)).then(x=>x.mtimeMs)));res.writeHead(200,{'content-type':'text/plain; charset=utf-8','cache-control':'no-store'});res.end(String(Math.max(...stamps)));return;}
  const staticFiles:Record<string,string>={'/styles.css':'text/css','/responsive.css':'text/css','/design.css':'text/css','/yesterday.css':'text/css','/today.css':'text/css','/new-loan.css':'text/css','/app.js':'text/javascript'};
  if(req.method==='GET'&&staticFiles[path]){res.writeHead(200,{'content-type':staticFiles[path]+'; charset=utf-8','cache-control':'no-store'});res.end(await readFile(asset(path.slice(1))));return;}
  if(!path.startsWith('/api/'))fail('Not found.',404);
  if(req.method!=='GET')checkOrigin(req);
  if(req.method==='GET'&&path==='/api/me'){
    if(!one(db,'SELECT id FROM users LIMIT 1'))return respond(res,200,{setup:true});
    try{const user=auth(req);return respond(res,200,{username:user.username,ownerId:user.user_id,csrf:user.csrf_token});}
    catch{return respond(res,200,{login:true});}
  }
  if(req.method==='POST'&&path==='/api/setup'){
    if(one(db,'SELECT id FROM users LIMIT 1'))fail('Already configured.',403);
    if(!['127.0.0.1','::1','::ffff:127.0.0.1'].includes(req.socket.remoteAddress||''))fail('Initial setup is local-only.',403);
    const data=await readBody(req),username=str(data.username,'a username',80),password=str(data.password,'a password',200);
    if(password.length<12)fail('Use at least 12 characters for the password.');
    const id=uuid();transaction(db,()=>{run(db,'INSERT INTO parties VALUES (?,?,?,?,?,?,?)',id,'Ayyappan','PERSON','OWNER,INVESTOR','','',now());run(db,'INSERT INTO users VALUES (?,?,?,?)',id,username,passHash(password),now());audit(id,'user',id,'created');});
    return respond(res,201,{ok:true});
  }
  if(req.method==='POST'&&path==='/api/login'){
    const data=await readBody(req),username=str(data.username,'a username',80),password=str(data.password,'a password',200);
    const key=req.socket.remoteAddress||'local',prior=attempts.get(key);
    if(prior&&prior.count>=5&&prior.until>Date.now())fail('Too many attempts. Try again later.',429);
    const user=one(db,'SELECT * FROM users WHERE username=?',username);
    if(!user||!passCheck(password,user.password_hash)){attempts.set(key,{count:(prior?.count||0)+1,until:Date.now()+15*60000});fail('Invalid credentials.',401);}
    attempts.delete(key);const token=randomBytes(32).toString('hex'),csrf=randomBytes(24).toString('hex');
    run(db,'INSERT INTO sessions VALUES (?,?,?,?)',digest(token),user.id,csrf,new Date(Date.now()+7*86400000).toISOString());
    const secure=req.socket.encrypted?'; Secure':'';
    res.setHeader('set-cookie',`session=${token}; HttpOnly; SameSite=Strict; Path=/; Max-Age=604800${secure}`);
    return respond(res,200,{ok:true});
  }
  const user=auth(req);
  if(req.method!=='GET'&&req.headers['x-csrf-token']!==user.csrf_token)fail('Session validation failed.',403);
  const actor=user.user_id;
  if(req.method==='POST'&&path==='/api/logout'){run(db,'DELETE FROM sessions WHERE token_hash=?',digest(cookie(req,'session')));res.setHeader('set-cookie','session=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0');return respond(res,200,{ok:true});}
  if(req.method==='GET'&&path==='/api/parties')return respond(res,200,all(db,'SELECT * FROM parties ORDER BY name'));
  if(req.method==='POST'&&path==='/api/schedule/preview'){const data=await readBody(req);return respond(res,200,scheduleInput(data,money(data.face),true));}
  if(req.method==='POST'&&path==='/api/parties'){
    const data=await readBody(req),result=idempotent(req.headers['idempotency-key'] as string,actor,()=>{const id=uuid(),name=str(data.name,'a name',120),kind=data.kind==='ORGANIZATION'?'ORGANIZATION':'PERSON';if(one(db,'SELECT id FROM parties WHERE lower(name)=lower(?) AND kind=?',name,kind))fail('A matching person or company already exists.');run(db,'INSERT INTO parties VALUES (?,?,?,?,?,?,?)',id,name,kind,optional(data.roles,100),optional(data.phone,50),optional(data.notes),now());audit(actor,'party',id,'created',name);return{id};});return respond(res,201,result);
  }
  if(req.method==='GET'&&path==='/api/accounts')return respond(res,200,all(db,`SELECT a.id,a.reference,a.type,a.arrangement,a.face_paise,a.interest_paise,a.net_paise,a.funded_date,a.status,a.agreement_date,b.name borrower_name,m.name manager_name,COALESCE((SELECT SUM(CASE WHEN r.reversal_of IS NULL THEN r.amount_paise ELSE -r.amount_paise END) FROM receipts r WHERE r.account_id=a.id),0) collected_paise FROM accounts a LEFT JOIN parties b ON b.id=a.borrower_id LEFT JOIN parties m ON m.id=a.manager_id ORDER BY a.created_at DESC`));
  if(req.method==='POST'&&path==='/api/accounts'){const data=await readBody(req);return respond(res,201,idempotent(req.headers['idempotency-key'] as string,actor,()=>createAccount(data,actor)));}
  const account=path.match(/^\/api\/accounts\/([a-f0-9-]+)$/);
  if(req.method==='GET'&&account)return respond(res,200,accountView(account[1]));
  const fund=path.match(/^\/api\/accounts\/([a-f0-9-]+)\/fund$/);
  if(req.method==='POST'&&fund){const data=await readBody(req),result=idempotent(req.headers['idempotency-key'] as string,actor,()=>{const a=one(db,'SELECT funded_date FROM accounts WHERE id=?',fund[1]);if(!a)fail('Loan not found.',404);if(a.funded_date)fail('Funding already confirmed.');run(db,'UPDATE accounts SET funded_date=?,updated_at=? WHERE id=?',date(data.fundedDate),now(),fund[1]);audit(actor,'account',fund[1],'funded');return{ok:true};});return respond(res,200,result);}
  const cheque=path.match(/^\/api\/accounts\/([a-f0-9-]+)\/cheques$/);
  if(req.method==='POST'&&cheque){const data=await readBody(req),result=idempotent(req.headers['idempotency-key'] as string,actor,()=>{const a=one(db,'SELECT type FROM accounts WHERE id=?',cheque[1]);if(!a||a.type==='EXTERNAL')fail('Physical cheques belong to self-managed loans only.');const i=one(db,'SELECT id FROM installments WHERE id=? AND account_id=?',data.installmentId,cheque[1]);if(!i)fail('Choose an installment.');const id=uuid();run(db,'INSERT INTO cheques VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)',id,cheque[1],i.id,str(data.number,'a cheque number',60),str(data.bank,'a bank',100),date(data.chequeDate),date(data.depositDate),num(money(data.amount)),'PENDING',null,null,null,now());audit(actor,'cheque',id,'recorded');return{id};});return respond(res,201,result);}
  const chequeAction=path.match(/^\/api\/cheques\/([a-f0-9-]+)\/(deposit|clear|bounce)$/);
  if(req.method==='POST'&&chequeAction){const data=await readBody(req),result=idempotent(req.headers['idempotency-key'] as string,actor,()=>{const c=one(db,'SELECT * FROM cheques WHERE id=?',chequeAction[1]);if(!c)fail('Cheque not found.',404);const action=chequeAction[2],stamp=now();if(action==='deposit'){if(c.status!=='PENDING')fail('Only pending cheques can be deposited.');run(db,'UPDATE cheques SET status=?,deposited_at=? WHERE id=?','DEPOSITED',stamp,c.id);}else if(action==='clear'){if(c.status!=='DEPOSITED')fail('Deposit the cheque before clearing it.');recordReceipt({amount_paise:c.amount_paise,installmentId:c.installment_id,receivedDate:data.receivedDate||today(),reference:c.number},c.account_id,actor,c.id);run(db,'UPDATE cheques SET status=?,cleared_at=? WHERE id=?','CLEARED',stamp,c.id);}else{if(!['PENDING','DEPOSITED'].includes(c.status))fail('This cheque cannot be bounced.');run(db,'UPDATE cheques SET status=?,bounced_at=? WHERE id=?','BOUNCED',stamp,c.id);}audit(actor,'cheque',c.id,action);return{ok:true};});return respond(res,200,result);}
  const receipt=path.match(/^\/api\/accounts\/([a-f0-9-]+)\/receipts$/);
  if(req.method==='POST'&&receipt){const data=await readBody(req);return respond(res,201,idempotent(req.headers['idempotency-key'] as string,actor,()=>recordReceipt(data,receipt[1],actor)));}
  const reversal=path.match(/^\/api\/receipts\/([a-f0-9-]+)\/reverse$/);
  if(req.method==='POST'&&reversal){const data=await readBody(req);return respond(res,200,idempotent(req.headers['idempotency-key'] as string,actor,()=>reverseReceipt(reversal[1],data,actor)));}
  const distribution=path.match(/^\/api\/accounts\/([a-f0-9-]+)\/distributions$/);
  if(req.method==='POST'&&distribution){const data=await readBody(req),result=idempotent(req.headers['idempotency-key'] as string,actor,()=>{const c=one(db,'SELECT * FROM contributions WHERE id=? AND account_id=? AND party_id<>?',data.contributionId,distribution[1],actor);if(!c)fail('Choose an external investor.');const amount=num(money(data.amount)),paid=one(db,'SELECT COALESCE(SUM(amount_paise),0) total FROM distributions WHERE contribution_id=?',c.id).total;if(amount<=0||amount>c.face_paise-paid)fail('Distribution exceeds investor entitlement.');const id=uuid();run(db,'INSERT INTO distributions VALUES (?,?,?,?,?,?,?)',id,distribution[1],c.id,amount,date(data.paidDate),optional(data.reference,120),now());audit(actor,'distribution',id,'recorded');return{id};});return respond(res,201,result);}
  if(req.method==='GET'&&path==='/api/dashboard/business')return respond(res,200,businessDashboard());
  if(req.method==='GET'&&path==='/api/dashboard/personal')return respond(res,200,personalDashboard(actor));
  if(req.method==='GET'&&path==='/api/audit')return respond(res,200,all(db,'SELECT a.*,u.username FROM audit_events a JOIN users u ON u.id=a.actor_id ORDER BY a.created_at DESC LIMIT 100'));
  if(req.method==='GET'&&path==='/api/reports/tomorrow')return respond(res,200,tomorrowCheques());
  if(req.method==='GET'&&path==='/api/reports/tomorrow.pdf'){const report=tomorrowCheques();return pdf(res,[`Tomorrow's Cheques - ${report.reportDate}`,'',...report.rows.map(r=>`${r.company_name}    INR ${(r.amount_paise/100).toFixed(2)}`),'',`Total    INR ${(report.rows.reduce((n,r)=>n+r.amount_paise,0)/100).toFixed(2)}`],'tomorrow-cheques.pdf');}
  const schedulePdf=path.match(/^\/api\/accounts\/([a-f0-9-]+)\/schedule.pdf$/);
  if(req.method==='GET'&&schedulePdf){const v=accountView(schedulePdf[1]);if(v.account.type==='EXTERNAL')fail('Borrower schedules are for self-managed loans only.');return pdf(res,[`Repayment schedule - ${v.account.reference}`,`Borrower: ${v.account.borrower_name}`,`Face value: INR ${(v.account.face_paise/100).toFixed(2)}`,'',...v.installments.map(i=>`${i.sequence_no}.  ${i.due_date}    INR ${(i.amount_paise/100).toFixed(2)}`)],`${v.account.reference}-schedule.pdf`);}
  fail('Not found.',404);
}
export function startServer(port=Number(process.env.PORT||3000),host=process.env.HOST||'127.0.0.1'){
  if(!['127.0.0.1','::1'].includes(host))throw Error('This local build only binds to loopback. Configure the hosted adapter and security gates before public deployment.');
  const server=createServer((req,res)=>{
    res.setHeader('x-content-type-options','nosniff');
    res.setHeader('referrer-policy','no-referrer');
    res.setHeader('x-frame-options','DENY');
    res.setHeader('content-security-policy',"default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self'; object-src 'none'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'");
    handle(req,res).catch((error:any)=>{if(res.headersSent){res.end();return;}respond(res,error.status||400,{error:error.message||'Request failed.'});});
  });
  return server.listen(port,host,()=>console.log(`Finance app: http://${host}:${(server.address() as any).port}`));
}
if(process.env.NODE_ENV!=='test')startServer();
