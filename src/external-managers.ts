/** Persistent directory IDs, never display-name comparisons, define external workflows. */
const DEFAULT_GANESH_ID = '408f3231-9500-4ec2-ab77-b5ba630a9896';
const DEFAULT_TRUE_FINANCE_ID = 'd9b29d2f-9e6d-4707-996d-8b82728e4dfb';

export type ExternalManagerRule = {
  id: string;
  arrangement: 'OWN_STAKE_EXTERNALLY_MANAGED' | 'MANAGED_POOL';
  allowedContributorIds: string[];
};

export function externalManagerRules(): ExternalManagerRule[] {
  const ganeshId = process.env.FINFAM_GANESH_MANAGER_ID || DEFAULT_GANESH_ID;
  const trueFinanceId = process.env.FINFAM_TRUE_FINANCE_MANAGER_ID || DEFAULT_TRUE_FINANCE_ID;
  const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  if (!uuid.test(ganeshId) || !uuid.test(trueFinanceId) || ganeshId === trueFinanceId) {
    throw new Error('External manager IDs must be distinct registered directory UUIDs.');
  }
  return [
    { id: ganeshId, arrangement: 'OWN_STAKE_EXTERNALLY_MANAGED', allowedContributorIds: [] },
    { id: trueFinanceId, arrangement: 'MANAGED_POOL', allowedContributorIds: [ganeshId] }
  ];
}

export function externalManagerRule(id: string): ExternalManagerRule | undefined {
  return externalManagerRules().find(rule => rule.id === id);
}
