export type ImeiState =
  | 'RECEIVED'
  | 'MASTER_WAREHOUSE'
  | 'REGIONAL_WAREHOUSE'
  | 'ALLOCATED_TO_MANAGER'
  | 'ALLOCATED_TO_TEAM'
  | 'ALLOCATED_TO_AGENT'
  | 'ALLOCATED_TO_SHOP'
  | 'SOLD'
  | 'RETURNED'
  | 'RECOVERY_PENDING'
  | 'RECOVERED'
  | 'DAMAGED'
  | 'LOST'
  | 'QUARANTINE'
  | 'TRANSFER_PENDING';

const transitions: Readonly<Record<ImeiState, readonly ImeiState[]>> = {
  RECEIVED: ['MASTER_WAREHOUSE', 'QUARANTINE', 'DAMAGED'],
  MASTER_WAREHOUSE: ['REGIONAL_WAREHOUSE', 'ALLOCATED_TO_MANAGER', 'TRANSFER_PENDING', 'DAMAGED', 'LOST', 'QUARANTINE'],
  REGIONAL_WAREHOUSE: ['ALLOCATED_TO_MANAGER', 'ALLOCATED_TO_TEAM', 'TRANSFER_PENDING', 'DAMAGED', 'LOST', 'QUARANTINE'],
  ALLOCATED_TO_MANAGER: ['ALLOCATED_TO_TEAM', 'TRANSFER_PENDING', 'RETURNED', 'RECOVERY_PENDING', 'DAMAGED', 'LOST'],
  ALLOCATED_TO_TEAM: ['ALLOCATED_TO_MANAGER', 'ALLOCATED_TO_AGENT', 'ALLOCATED_TO_SHOP', 'TRANSFER_PENDING', 'RETURNED', 'RECOVERY_PENDING', 'DAMAGED', 'LOST'],
  ALLOCATED_TO_AGENT: ['ALLOCATED_TO_TEAM', 'TRANSFER_PENDING', 'SOLD', 'RETURNED', 'RECOVERY_PENDING', 'DAMAGED', 'LOST'],
  ALLOCATED_TO_SHOP: ['ALLOCATED_TO_TEAM', 'TRANSFER_PENDING', 'SOLD', 'RETURNED', 'RECOVERY_PENDING', 'DAMAGED', 'LOST'],
  SOLD: ['RETURNED', 'RECOVERY_PENDING'],
  RETURNED: ['QUARANTINE', 'MASTER_WAREHOUSE', 'REGIONAL_WAREHOUSE', 'DAMAGED'],
  RECOVERY_PENDING: ['RECOVERED', 'LOST', 'DAMAGED', 'QUARANTINE'],
  RECOVERED: ['MASTER_WAREHOUSE', 'REGIONAL_WAREHOUSE', 'QUARANTINE', 'DAMAGED'],
  DAMAGED: ['QUARANTINE', 'MASTER_WAREHOUSE', 'REGIONAL_WAREHOUSE', 'LOST'],
  LOST: ['RECOVERED', 'QUARANTINE'],
  QUARANTINE: ['MASTER_WAREHOUSE', 'REGIONAL_WAREHOUSE', 'DAMAGED', 'LOST'],
  TRANSFER_PENDING: ['MASTER_WAREHOUSE', 'REGIONAL_WAREHOUSE', 'ALLOCATED_TO_MANAGER', 'ALLOCATED_TO_TEAM', 'ALLOCATED_TO_AGENT', 'ALLOCATED_TO_SHOP'],
};

export class InvalidImeiTransitionError extends Error {
  constructor(readonly from: ImeiState, readonly to: ImeiState) {
    super(`Illegal IMEI state transition: ${from} -> ${to}`);
    this.name = 'InvalidImeiTransitionError';
  }
}

export function canTransitionImei(from: ImeiState, to: ImeiState): boolean {
  return transitions[from].includes(to);
}

export function assertImeiTransition(from: ImeiState, to: ImeiState): void {
  if (!canTransitionImei(from, to)) {
    throw new InvalidImeiTransitionError(from, to);
  }
}

export function allowedImeiTransitions(from: ImeiState): readonly ImeiState[] {
  return transitions[from];
}
