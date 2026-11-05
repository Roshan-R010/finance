import test from 'node:test';
import assert from 'node:assert/strict';
import { db, run, transaction, one } from '../src/prisma-db.ts';
import { uuid, now, today, createAccount, accountView, recordReceipt, reverseReceipt, businessDashboard, personalDashboard, markInstallmentDecision } from '../src/service.prisma.ts';

test('Supabase Prisma finance and daily checklist flow rolls back all synthetic data',async()=>{
  const owner=uuid(),borrower=uuid();
  try {
    await transaction(db,async()=>{
      await run(db,'INSERT INTO users VALUES (?,?,?,?)',owner,'prisma-smoke-'+owner,'test-only',now());
      await run(db,'INSERT INTO parties VALUES (?,?,?,?,?,?,?)',owner,'Test Owner','PERSON','OWNER','','',now());
      await run(db,'INSERT INTO parties VALUES (?,?,?,?,?,?,?)',borrower,'Test Borrower','PERSON','BORROWER','','',now());
      const {id}=await createAccount({type:'SOLO_SELF_MANAGED',arrangement:'NONE',borrowerId:borrower,face:'1000000',rate:'10',agreementDate:today(),schedule:{mode:'COUNT',count:10,firstDate:today(),intervalDays:7},basis:'FACE_SHARE',partners:[]},owner);
      let view=await accountView(id);
      assert.equal(view.installments.length,10);
      assert.equal(view.contributions.length,1);
      const installmentId=view.installments[0].id;
      const receipt=await recordReceipt({amount:'25000',method:'BANK_TRANSFER',installmentId,receivedDate:today()},id,owner);
      view=await accountView(id);
      assert.equal(view.collected_paise,2500000);
      await reverseReceipt(receipt.id,{reason:'Smoke check',receivedDate:today()},owner);
      view=await accountView(id);
      assert.equal(view.collected_paise,0);
      const before=await businessDashboard();
      assert.ok(before.todayInstallments.some(x=>x.id===installmentId));
      await markInstallmentDecision(installmentId,'UNPAID',owner);
      let decision=await one(db,'SELECT decision FROM installment_decisions WHERE installment_id=?',installmentId);
      assert.equal(decision.decision,'UNPAID');
      assert.equal((await accountView(id)).installments[0].decision,'UNPAID');
      assert.equal((await accountView(id)).collected_paise,0);
      await markInstallmentDecision(installmentId,'PAID',owner);
      view=await accountView(id);
      const firstPaid=view.collected_paise;
      assert.equal(firstPaid,view.installments[0].amount_paise);
      decision=await one(db,'SELECT decision FROM installment_decisions WHERE installment_id=?',installmentId);
      assert.equal(decision.decision,'PAID');
      await markInstallmentDecision(installmentId,'PAID',owner);
      assert.equal((await accountView(id)).collected_paise,firstPaid);
      await markInstallmentDecision(installmentId,'UNPAID',owner);
      assert.equal((await accountView(id)).collected_paise,0);
      assert.equal((await accountView(id)).installments[0].decision,'UNPAID');
      await markInstallmentDecision(installmentId,'PAID',owner);
      assert.equal((await accountView(id)).collected_paise,firstPaid);
      const overdueId=view.installments[1].id;
      await assert.rejects(markInstallmentDecision(overdueId,'PAID',owner),/Only due or overdue/);
      const yesterday=new Date(Date.parse(today()+'T00:00:00Z')-86400000).toISOString().slice(0,10);
      await run(db,'UPDATE installments SET due_date=? WHERE id=?',yesterday,overdueId);
      await markInstallmentDecision(overdueId,'UNPAID',owner);
      assert.equal((await accountView(id)).installments[1].decision,'UNPAID');
      await markInstallmentDecision(overdueId,'PAID',owner);
      assert.equal((await accountView(id)).installments[1].paid_paise,view.installments[1].amount_paise);
      assert.ok((await personalDashboard(owner)).accounts.length);
      throw new Error('ROLLBACK_CHECK');
    },90000);
  } catch(error:any) { if(error.message!=='ROLLBACK_CHECK')throw error; }
  assert.equal(await one(db,'SELECT id FROM users WHERE id=?',owner),undefined);
  await db.$disconnect();
});
