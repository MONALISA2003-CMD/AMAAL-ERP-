export type AllocationStatus =
  | 'DRAFT'
  | 'REQUESTED'
  | 'APPROVED'
  | 'IN_TRANSIT'
  | 'RECEIVED'
  | 'REJECTED'
  | 'CANCELLED';

export type SaleStatus =
  | 'DRAFT'
  | 'PENDING_APPROVAL'
  | 'CONFIRMED'
  | 'COMPLETED'
  | 'CANCELLED'
  | 'REVERSED';

export type RecoveryStatus =
  | 'OPEN'
  | 'ASSIGNED'
  | 'IN_PROGRESS'
  | 'PROMISED_RETURN'
  | 'RECOVERED'
  | 'PARTIALLY_RECOVERED'
  | 'NOT_FOUND'
  | 'ESCALATED'
  | 'CLOSED'
  | 'CANCELLED';

export type SaleState = SaleStatus;
export type RecoveryState = RecoveryStatus;

const allocationTransitions: Readonly<Record<AllocationStatus, readonly AllocationStatus[]>> = {
  DRAFT: ['REQUESTED', 'CANCELLED'],
  REQUESTED: ['APPROVED', 'REJECTED', 'CANCELLED'],
  APPROVED: ['IN_TRANSIT', 'CANCELLED'],
  IN_TRANSIT: ['RECEIVED'],
  RECEIVED: [],
  REJECTED: [],
  CANCELLED: [],
};

const saleTransitions: Readonly<Record<SaleStatus, readonly SaleStatus[]>> = {
  DRAFT: ['PENDING_APPROVAL', 'CONFIRMED', 'CANCELLED'],
  PENDING_APPROVAL: ['CONFIRMED', 'CANCELLED'],
  CONFIRMED: ['COMPLETED', 'CANCELLED'],
  COMPLETED: ['REVERSED'],
  CANCELLED: [],
  REVERSED: [],
};

const recoveryTransitions: Readonly<Record<RecoveryStatus, readonly RecoveryStatus[]>> = {
  OPEN: ['ASSIGNED', 'CANCELLED'],
  ASSIGNED: ['IN_PROGRESS', 'CANCELLED'],
  IN_PROGRESS: ['PROMISED_RETURN', 'RECOVERED', 'PARTIALLY_RECOVERED', 'NOT_FOUND', 'ESCALATED', 'CANCELLED'],
  PROMISED_RETURN: ['RECOVERED', 'PARTIALLY_RECOVERED', 'NOT_FOUND', 'ESCALATED', 'CANCELLED'],
  RECOVERED: ['CLOSED'],
  PARTIALLY_RECOVERED: ['IN_PROGRESS', 'RECOVERED', 'ESCALATED', 'CLOSED'],
  NOT_FOUND: ['IN_PROGRESS', 'ESCALATED', 'CLOSED'],
  ESCALATED: ['IN_PROGRESS', 'PROMISED_RETURN', 'RECOVERED', 'PARTIALLY_RECOVERED', 'NOT_FOUND', 'CLOSED'],
  CLOSED: [],
  CANCELLED: [],
};

export function canTransitionAllocation(from: AllocationStatus, to: AllocationStatus): boolean {
  return allocationTransitions[from].includes(to);
}

export function canTransitionSale(from: SaleStatus, to: SaleStatus): boolean {
  return saleTransitions[from].includes(to);
}

export function canTransitionRecovery(from: RecoveryStatus, to: RecoveryStatus): boolean {
  return recoveryTransitions[from].includes(to);
}

export function assertAllocationTransition(from: AllocationStatus, to: AllocationStatus): void {
  if (!canTransitionAllocation(from, to)) throw new Error(`Illegal allocation transition: ${from} -> ${to}`);
}

export function assertSaleTransition(from: SaleStatus, to: SaleStatus): void {
  if (!canTransitionSale(from, to)) throw new Error(`Illegal sale transition: ${from} -> ${to}`);
}

export function assertRecoveryTransition(from: RecoveryStatus, to: RecoveryStatus): void {
  if (!canTransitionRecovery(from, to)) throw new Error(`Illegal recovery transition: ${from} -> ${to}`);
}

export function assertNonEmpty(value: string, field: string): void {
  if (typeof value !== 'string' || !value.trim()) throw new Error(`${field} is required.`);
}

export function assertPositiveMoney(value: number, field = 'amount'): void {
  if (!Number.isFinite(value) || value <= 0) throw new Error(`${field} must be greater than zero.`);
}
