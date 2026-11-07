import 'dotenv/config';
import { db, one, run, transaction } from '../src/prisma-db.ts';
import { uuid, now, today, shiftDate, createAccount, confirmChequeResult } from '../src/service.prisma.ts';
import { externalManagerRules } from '../src/external-managers.ts';
import { openCash, addCashFund, cashSummary } from '../src/cash.prisma.ts';

if(process.argv[2]!=='--replace-test-records')throw new Error('Use --replace-test-records to replace the finance sample data.');
const owner=await one(db,"SELECT id FROM parties WHERE roles ILIKE '%OWNER%' LIMIT 1");
if(!owner)throw new Error('Sign in setup must exist before seeding.');
const [ganeshRule,trueFinanceRule]=externalManagerRules();
const date=today(),openingDate=shiftDate(date,-8);

async function party(id:string,name:string,kind:'PERSON'|'ORGANIZATION',roles:string,phone=''){
  await run(db,'INSERT INTO parties (id,name,kind,roles,phone,notes,created_at) VALUES (?,?,?,?,?,?,?)',id,name,kind,roles,phone,'Sample record for design testing',now());
  return id;
}
const schedule=(firstDate:string,count:number)=>({mode:'COUNT',count,firstDate,intervalDays:7});

try{
  await transaction(db,async()=>{
    await run(db,'DELETE FROM cash_allocations');
    await run(db,'DELETE FROM cash_movements');
    await run(db,'DELETE FROM cash_cutover');
    await run(db,'DELETE FROM installment_decisions');
    await run(db,'DELETE FROM cheques');
    await run(db,'DELETE FROM receipts');
    await run(db,'DELETE FROM distributions');
    await run(db,'DELETE FROM installments');
    await run(db,'DELETE FROM contributions');
    await run(db,'DELETE FROM accounts');
    await run(db,'DELETE FROM parties WHERE id<>?',owner.id);
    await run(db,'DELETE FROM audit_events');
    await run(db,'DELETE FROM request_keys');

    await party(ganeshRule.id,'Ganesh','PERSON','MANAGER,INVESTOR','9876500001');
    await party(trueFinanceRule.id,'True Finance','ORGANIZATION','MANAGER','9876500002');
    const bluebird=await party(uuid(),'Bluebird Textiles','ORGANIZATION','BORROWER','9876500011');
    const meenakshi=await party(uuid(),'Meenakshi Silks','ORGANIZATION','BORROWER','9876500012');
    const lakshmi=await party(uuid(),'Lakshmi Auto Spares','ORGANIZATION','BORROWER','9876500013');
    const karthik=await party(uuid(),'Karthik Traders','ORGANIZATION','BORROWER','9876500014');
    const sk=await party(uuid(),'SK Traders','ORGANIZATION','BORROWER','9876500015');
    const star=await party(uuid(),'Star Tech Solutions','ORGANIZATION','BORROWER','9876500016');
    await openCash({date:openingDate,ownManaged:'3000000',ownOutside:'0',partners:[{partyId:ganeshRule.id,amount:'200000'}]},owner.id);
    await addCashFund({amount:'50000',source:'Sample savings added',date:shiftDate(date,-1),notes:'Design test data'},owner.id);

    const passed=await createAccount({type:'SOLO_SELF_MANAGED',arrangement:'NONE',borrowerId:bluebird,face:'500000',rate:'10',agreementDate:shiftDate(date,-5),basis:'FACE_SHARE',partners:[],ownerCashSource:'MANAGED',schedule:schedule(shiftDate(date,-1),5)},owner.id);
    await createAccount({type:'JOINT_SELF_MANAGED',arrangement:'NONE',borrowerId:meenakshi,face:'400000',rate:'10',agreementDate:shiftDate(date,-4),basis:'FACE_SHARE',partners:[{partyId:ganeshRule.id,amount:'200000'}],ownerCashSource:'MANAGED',partnerCustody:[{partyId:ganeshRule.id,custody:'NEW_HELD'}],schedule:schedule(shiftDate(date,-1),4)},owner.id);
    await createAccount({type:'SOLO_SELF_MANAGED',arrangement:'NONE',borrowerId:lakshmi,face:'300000',rate:'12',agreementDate:shiftDate(date,-3),basis:'FACE_SHARE',partners:[],ownerCashSource:'MANAGED',schedule:schedule(date,3)},owner.id);
    const bounced=await createAccount({type:'SOLO_SELF_MANAGED',arrangement:'NONE',borrowerId:karthik,face:'200000',rate:'10',agreementDate:shiftDate(date,-2),basis:'FACE_SHARE',partners:[],ownerCashSource:'MANAGED',schedule:schedule(shiftDate(date,-1),2)},owner.id);
    await createAccount({type:'EXTERNAL',arrangement:'OWN_STAKE_EXTERNALLY_MANAGED',borrowerId:sk,managerId:ganeshRule.id,face:'200000',rate:'15',agreementDate:shiftDate(date,-2),basis:'FACE_SHARE',partners:[],ownerCashSource:'MANAGED'},owner.id);
    await createAccount({type:'EXTERNAL',arrangement:'MANAGED_POOL',borrowerId:star,managerId:trueFinanceRule.id,face:'400000',rate:'15',agreementDate:shiftDate(date,-1),basis:'FACE_SHARE',partners:[{partyId:ganeshRule.id,amount:'200000'}],ownerCashSource:'MANAGED',partnerCustody:[{partyId:ganeshRule.id,custody:'DIRECT'}]},owner.id);

    for(const [accountId,status] of [[passed.id,'PASSED'],[bounced.id,'BOUNCED']] as const){
      const cheque=await one(db,'SELECT id FROM cheques WHERE account_id=? ORDER BY scheduled_date LIMIT 1',accountId);
      await confirmChequeResult(cheque.id,status,owner.id);
    }
    const cash=await cashSummary(owner.id);
    if(!cash.started||cash.managed<0||cash.personal<0)throw new Error('Seeded cash did not reconcile.');
    const count=(await one(db,'SELECT COUNT(*)::int AS count FROM accounts')).count;
    console.log(`Created ${count} design loans. Managed cash: ${cash.managed} paise; Ayyappan cash: ${cash.personal} paise.`);
  },180000);
}finally{
  await db.$disconnect();
}
