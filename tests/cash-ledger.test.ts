import test from 'node:test';
import assert from 'node:assert/strict';
import { db, one, run, transaction } from '../src/prisma-db.ts';
import { uuid, now, today, createAccount, recordReceipt, reverseReceipt, confirmChequeResult, deleteAccount } from '../src/service.prisma.ts';
import { addCashFund, cashStarted, cashSummary, openCash, postDistributionCash } from '../src/cash.prisma.ts';
import { externalManagerRules } from '../src/external-managers.ts';

test('cash movements reconcile ownership, custody, collections, and reversals',async()=>{
  const owner=(await one(db,"SELECT id FROM parties WHERE roles ILIKE '%OWNER%' LIMIT 1"))?.id;
  assert.ok(owner,'Existing owner is required for the cash service test.');
  const borrower=uuid(),partner=uuid(),date=today();
  try{
    await transaction(db,async()=>{
      await run(db,'INSERT INTO parties (id,name,kind,roles,phone,notes,created_at) VALUES (?,?,?,?,?,?,?)',borrower,'Cash Test Borrower','ORGANIZATION','BORROWER','','',now());
      await run(db,'INSERT INTO parties (id,name,kind,roles,phone,notes,created_at) VALUES (?,?,?,?,?,?,?)',partner,'Cash Test Partner','PERSON','INVESTOR','','',now());
      if(!await cashStarted())await openCash({date,ownManaged:'0',ownOutside:'0',partners:[]},owner);
      const baseline=await cashSummary(owner);
      const fund=await addCashFund({amount:'1000000',source:'Test savings',date,notes:'Test only'},owner);
      let cash=await cashSummary(owner);
      assert.equal(cash.personal-baseline.personal,100000000);
      assert.equal(cash.managed-baseline.managed,100000000);
      assert.equal((await one(db,'SELECT COUNT(*) AS count FROM cash_movements WHERE source_id=?',fund.id)).count,1);
      assert.equal((await one(db,'SELECT notes FROM cash_movements WHERE source_id=?',fund.id)).notes,'Test only');

      const solo=await createAccount({type:'SOLO_SELF_MANAGED',arrangement:'NONE',borrowerId:borrower,face:'500000',rate:'10',agreementDate:date,basis:'FACE_SHARE',partners:[],ownerCashSource:'MANAGED',schedule:{mode:'COUNT',count:5,firstDate:date,intervalDays:7}},owner);
      cash=await cashSummary(owner);
      assert.equal(cash.personal-baseline.personal,55000000);
      assert.equal(cash.managed-baseline.managed,55000000);
      const soloCheque=await one(db,'SELECT id FROM cheques WHERE account_id=? ORDER BY scheduled_date LIMIT 1',solo.id);
      await confirmChequeResult(soloCheque.id,'BOUNCED',owner);
      cash=await cashSummary(owner);
      assert.equal(cash.managed-baseline.managed,55000000);

      const joint=await createAccount({type:'JOINT_SELF_MANAGED',arrangement:'NONE',borrowerId:borrower,face:'400000',rate:'10',agreementDate:date,basis:'FACE_SHARE',partners:[{partyId:partner,amount:'200000'}],ownerCashSource:'MANAGED',partnerCustody:[{partyId:partner,custody:'NEW_HELD'}],schedule:{mode:'COUNT',count:4,firstDate:date,intervalDays:7}},owner);
      cash=await cashSummary(owner);
      assert.equal(cash.personal-baseline.personal,37000000);
      assert.equal(cash.managed-baseline.managed,37000000);
      assert.equal(cash.partnerHeld-baseline.partnerHeld,0);
      const installment=await one(db,'SELECT id FROM installments WHERE account_id=? ORDER BY sequence_no LIMIT 1',joint.id);
      const receipt=await recordReceipt({amount:'100000',method:'CASH',installmentId:installment.id,receivedDate:date},joint.id,owner);
      cash=await cashSummary(owner);
      assert.equal(cash.managed-baseline.managed,47000000);
      assert.equal(cash.personal-baseline.personal,42000000);
      assert.equal(cash.partnerHeld-baseline.partnerHeld,5000000);
      await reverseReceipt(receipt.id,{reason:'Correction',receivedDate:date},owner);
      cash=await cashSummary(owner);
      assert.equal(cash.managed-baseline.managed,37000000);
      assert.equal(cash.personal-baseline.personal,37000000);
      assert.equal(cash.partnerHeld-baseline.partnerHeld,0);
      await recordReceipt({amount:'100000',method:'CASH',installmentId:installment.id,receivedDate:date},joint.id,owner);
      const contribution=await one(db,'SELECT id FROM contributions WHERE account_id=? AND party_id=?',joint.id,partner);
      const distributionId=uuid();
      await run(db,'INSERT INTO distributions VALUES (?,?,?,?,?,?,?)',distributionId,joint.id,contribution.id,5000000,date,'Test payout',now());
      await postDistributionCash(distributionId,joint.id,partner,5000000,date,owner);
      cash=await cashSummary(owner);
      assert.equal(cash.managed-baseline.managed,42000000);
      assert.equal(cash.partnerHeld-baseline.partnerHeld,0);
      await deleteAccount(joint.id,owner);
      cash=await cashSummary(owner);
      assert.equal(cash.managed-baseline.managed,55000000);
      assert.equal(cash.personal-baseline.personal,55000000);

      const direct=await createAccount({type:'JOINT_SELF_MANAGED',arrangement:'NONE',borrowerId:borrower,face:'200000',rate:'10',agreementDate:date,basis:'FACE_SHARE',partners:[{partyId:partner,amount:'100000'}],ownerCashSource:'MANAGED',partnerCustody:[{partyId:partner,custody:'DIRECT'}],schedule:{mode:'COUNT',count:2,firstDate:date,intervalDays:7}},owner);
      cash=await cashSummary(owner);
      assert.equal(cash.managed-baseline.managed,46000000);
      assert.equal(cash.personal-baseline.personal,46000000);
      await deleteAccount(direct.id,owner);
      const outside=await createAccount({type:'SOLO_SELF_MANAGED',arrangement:'NONE',borrowerId:borrower,face:'100000',rate:'10',agreementDate:date,basis:'FACE_SHARE',partners:[],ownerCashSource:'OUTSIDE',schedule:{mode:'COUNT',count:2,firstDate:date,intervalDays:7}},owner);
      cash=await cashSummary(owner);
      assert.equal(cash.managed-baseline.managed,55000000);
      assert.equal(cash.personal-baseline.personal,46000000);
      await deleteAccount(outside.id,owner);

      const managerId=externalManagerRules()[0].id;
      if(await one(db,'SELECT id FROM parties WHERE id=?',managerId)){
        const external=await createAccount({type:'EXTERNAL',arrangement:'OWN_STAKE_EXTERNALLY_MANAGED',borrowerId:borrower,managerId,face:'100000',rate:'10',agreementDate:date,basis:'FACE_SHARE',partners:[],ownerCashSource:'MANAGED'},owner);
        cash=await cashSummary(owner);
        assert.equal(cash.managed-baseline.managed,46000000);
        const returned=await recordReceipt({amount:'10000',method:'BANK_TRANSFER',receivedDate:date,cashDestination:'OUTSIDE'},external.id,owner);
        cash=await cashSummary(owner);
        assert.equal(cash.managed-baseline.managed,46000000);
        assert.equal(cash.personal-baseline.personal,47000000);
        await reverseReceipt(returned.id,{reason:'Test correction',receivedDate:date},owner);
        await deleteAccount(external.id,owner);
      }
      cash=await cashSummary(owner);
      assert.equal(cash.managed-baseline.managed,55000000);
      assert.equal(cash.personal-baseline.personal,55000000);
      throw new Error('ROLLBACK_CASH_TEST');
    },180000);
  }catch(error:any){if(error.message!=='ROLLBACK_CASH_TEST')throw error;}
  assert.equal(await one(db,'SELECT id FROM parties WHERE id=?',borrower),undefined);
  await db.$disconnect();
});
