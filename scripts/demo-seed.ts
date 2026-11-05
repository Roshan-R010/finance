import { randomBytes, scryptSync } from 'node:crypto';
import { one, run, transaction } from '../src/db.ts';
import { db, uuid, now, createAccount } from '../src/service.ts';

const password=process.env.DEMO_PASSWORD;
if(!password||password.length<12)throw Error('Set DEMO_PASSWORD to at least 12 characters for a disposable demo database.');
if(one(db,'SELECT id FROM users LIMIT 1'))throw Error('Database already contains a user; demo seed refused.');
const owner=uuid(),salt=randomBytes(16).toString('hex'),passwordHash=`${salt}:${scryptSync(password,salt,64).toString('hex')}`;
const person=(name:string,kind:'PERSON'|'ORGANIZATION',roles:string)=>{const id=uuid();run(db,'INSERT INTO parties VALUES (?,?,?,?,?,?,?)',id,name,kind,roles,'','Fictional demo record',now());return id;};
transaction(db,()=>{
  run(db,'INSERT INTO parties VALUES (?,?,?,?,?,?,?)',owner,'Ayyappan','PERSON','OWNER,INVESTOR','','Fictional demo owner',now());
  run(db,'INSERT INTO users VALUES (?,?,?,?)',owner,'demo',passwordHash,now());
  const soloBorrower=person('Cedar Textiles','ORGANIZATION','BORROWER');
  const jointBorrower=person('Harbor Traders','ORGANIZATION','BORROWER');
  const poolManager=person('Northstar Finance','ORGANIZATION','MANAGER');
  const personalManager=person('Riverbend Capital','ORGANIZATION','MANAGER');
  const investor=person('Mira Rao','PERSON','INVESTOR');
  createAccount({type:'SOLO_SELF_MANAGED',arrangement:'NONE',borrowerId:soloBorrower,face:'1000000',rate:'10',agreementDate:'2026-11-05',basis:'FACE_SHARE',partners:[],schedule:{mode:'COUNT',count:10,firstDate:'2026-11-12',intervalDays:7}},owner);
  createAccount({type:'JOINT_SELF_MANAGED',arrangement:'NONE',borrowerId:jointBorrower,face:'1000000',rate:'10',agreementDate:'2026-11-05',basis:'FACE_SHARE',partners:[{partyId:investor,amount:'300000'}],schedule:{mode:'COUNT',count:10,firstDate:'2026-11-13',intervalDays:7}},owner);
  createAccount({type:'EXTERNAL',arrangement:'MANAGED_POOL',managerId:poolManager,face:'500000',rate:'17',agreementDate:'2026-11-05',basis:'FACE_SHARE',partners:[{partyId:investor,amount:'250000'}],schedule:{mode:'COUNT',count:5,firstDate:'2026-11-15',intervalDays:30}},owner);
  createAccount({type:'EXTERNAL',arrangement:'OWN_STAKE_EXTERNALLY_MANAGED',managerId:personalManager,face:'250000',rate:'17',agreementDate:'2026-11-05',basis:'FACE_SHARE',partners:[]},owner);
});
console.log('Fictional demo data created. Sign in as demo using DEMO_PASSWORD.');
db.close();
