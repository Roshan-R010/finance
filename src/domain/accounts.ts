export type AccountInput = {
  type: 'SOLO_SELF_MANAGED' | 'JOINT_SELF_MANAGED' | 'EXTERNAL';
  arrangement: 'NONE' | 'MANAGED_POOL' | 'OWN_STAKE_EXTERNALLY_MANAGED';
  borrowerId?: string;
  externalManagerId?: string;
  ownerId: string;
  contributorIds: string[];
  hasSchedule: boolean;
};

/** Classification is based on explicit responsibility, never a party name. */
export function classifyAccount(account: AccountInput) {
  const { type, arrangement, borrowerId, externalManagerId, ownerId, contributorIds, hasSchedule } = account;
  if (!ownerId || contributorIds.some(id => !id) || new Set(contributorIds).size !== contributorIds.length || !contributorIds.includes(ownerId)) throw new Error('Invalid contributors');
  if (type === 'SOLO_SELF_MANAGED' || type === 'JOINT_SELF_MANAGED') {
    if (arrangement !== 'NONE' || !borrowerId || externalManagerId || !hasSchedule) throw new Error('Invalid self-managed account');
    if (type === 'SOLO_SELF_MANAGED' && contributorIds.length !== 1) throw new Error('Solo account requires only the owner');
    return { scope: 'BORROWER_FACE' as const, businessEligible: true, scheduleRequired: true, physicalChequesAllowed: true };
  }
  if (type !== 'EXTERNAL' || !externalManagerId || arrangement === 'NONE') throw new Error('Invalid external account');
  if (arrangement === 'OWN_STAKE_EXTERNALLY_MANAGED') {
    if (contributorIds.length !== 1) throw new Error('Personal stake includes only the owner');
    return { scope: 'PERSONAL_STAKE_FACE' as const, businessEligible: false, scheduleRequired: false, physicalChequesAllowed: false };
  }
  if (arrangement !== 'MANAGED_POOL') throw new Error('Invalid arrangement');
  return { scope: 'POOL_FACE' as const, businessEligible: false, scheduleRequired: false, physicalChequesAllowed: false };
}
