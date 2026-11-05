import { test } from 'node:test';
import assert from 'node:assert/strict';
import { classifyAccount, type AccountInput } from '../src/domain/accounts.ts';

const solo: AccountInput = {type:'SOLO_SELF_MANAGED',arrangement:'NONE',borrowerId:'borrower',ownerId:'owner',contributorIds:['owner'],hasSchedule:true};
test('classifies all four recorded scopes and excludes external arrangements from business', () => {
  assert.equal(classifyAccount(solo).scope, 'BORROWER_FACE');
  assert.equal(classifyAccount({...solo,type:'JOINT_SELF_MANAGED',contributorIds:['owner','investor']}).businessEligible, true);
  const pool: AccountInput = {type:'EXTERNAL',arrangement:'MANAGED_POOL',externalManagerId:'manager',ownerId:'owner',contributorIds:['owner','investor'],hasSchedule:true};
  assert.deepEqual(classifyAccount(pool), {scope:'POOL_FACE',businessEligible:false,scheduleRequired:false,physicalChequesAllowed:false});
  assert.deepEqual(classifyAccount({...pool,arrangement:'OWN_STAKE_EXTERNALLY_MANAGED',contributorIds:['owner'],hasSchedule:false}), {scope:'PERSONAL_STAKE_FACE',businessEligible:false,scheduleRequired:false,physicalChequesAllowed:false});
});
test('rejects invalid parties, arrangements and schedules', () => {
  assert.throws(() => classifyAccount({...solo,borrowerId:undefined}));
  assert.throws(() => classifyAccount({...solo,hasSchedule:false}));
  assert.throws(() => classifyAccount({...solo,contributorIds:['owner','owner']}));
  assert.throws(() => classifyAccount({...solo,type:'EXTERNAL',arrangement:'MANAGED_POOL',externalManagerId:undefined}));
  assert.throws(() => classifyAccount({type:'EXTERNAL',arrangement:'OWN_STAKE_EXTERNALLY_MANAGED',externalManagerId:'manager',ownerId:'owner',contributorIds:['owner','manager'],hasSchedule:false}));
});
