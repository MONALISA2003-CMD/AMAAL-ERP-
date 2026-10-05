export function roleLabel(value: string | null | undefined): string {
  if (!value) return '—';
  const labels: Record<string, string> = {
    CEO: 'CEO',
    ADMIN: 'Administrator',
    REGIONAL_MANAGER: 'Regional manager',
    MANAGER: 'Manager',
    TEAM_LEADER: 'Team leader',
    AGENT: 'Sales agent',
    SHOP_OWNER: 'Shop owner',
    RECOVERY_OFFICER: 'Recovery officer',
  };
  return labels[value] ?? 'Staff member';
}

export function statusLabel(value: string | null | undefined): string {
  if (!value) return '—';
  const labels: Record<string, string> = {
    ACTIVE: 'Active', INACTIVE: 'Inactive', PENDING: 'Pending',
    REQUESTED: 'Requested', APPROVED: 'Approved', REJECTED: 'Rejected',
    IN_TRANSIT: 'In transit', RECEIVED: 'Received', CANCELLED: 'Cancelled',
    CLOSED: 'Closed', OPEN: 'Open', ASSIGNED: 'Assigned', REVERSED: 'Reversed',
    EXECUTED: 'Completed', EXPIRED: 'Expired', DRAFT: 'Draft',
    PENDING_APPROVAL: 'Waiting for approval', SUSPENDED: 'Paused',
    RECOVERY_PENDING: 'Recovery needed', RECOVERED: 'Recovered',
    DAMAGED: 'Damaged', LOST: 'Lost', QUARANTINE: 'Quarantined',
    TRANSFER_PENDING: 'Transfer waiting', RECEIVED: 'Received',
  };
  return labels[value] ?? 'Needs review';
}

export function inventoryStateLabel(value: string | null | undefined): string {
  if (!value) return '—';
  const labels: Record<string, string> = {
    RECEIVED: 'Received', MASTER_WAREHOUSE: 'Main warehouse', REGIONAL_WAREHOUSE: 'Regional warehouse',
    ALLOCATED_TO_MANAGER: 'With manager', ALLOCATED_TO_TEAM: 'With team', ALLOCATED_TO_AGENT: 'With sales agent',
    ALLOCATED_TO_SHOP: 'At shop', SOLD: 'Sold', RETURNED: 'Returned', RECOVERY_PENDING: 'Recovery needed',
    RECOVERED: 'Recovered', DAMAGED: 'Damaged', LOST: 'Lost', QUARANTINE: 'Quarantined', TRANSFER_PENDING: 'Transfer waiting',
  };
  return labels[value] ?? statusLabel(value);
}

export function paymentTypeLabel(value: string | null | undefined): string {
  if (value === 'CASH') return 'Cash';
  if (value === 'LOAN') return 'Loan';
  return statusLabel(value);
}

export function calculationLabel(value: string | null | undefined): string {
  if (value === 'PERCENT_OF_SALE') return 'Percentage of sale';
  if (value === 'FIXED_AMOUNT') return 'Fixed amount';
  return statusLabel(value);
}

export function targetLabel(value: string | null | undefined): string {
  if (value === 'SALES_COUNT') return 'Number of sales';
  if (value === 'SALES_VALUE') return 'Sales value';
  return statusLabel(value);
}

export function periodLabel(value: string | null | undefined): string {
  if (value === 'WEEKLY') return 'Weekly';
  if (value === 'MONTHLY') return 'Monthly';
  if (value === 'QUARTERLY') return 'Quarterly';
  return statusLabel(value);
}

export function scopeLabel(value: string | null | undefined): string {
  const labels: Record<string, string> = {
    COMPANY: 'Company', REGION: 'Region', SUBREGION: 'Area', TEAM: 'Team', SHOP: 'Shop', USER: 'Person', WAREHOUSE: 'Warehouse',
  };
  return labels[value ?? ''] ?? statusLabel(value);
}


export function adminProfileLabel(value: string | null | undefined): string {
  const labels: Record<string, string> = {
    SYSTEM_ADMIN: 'System administrator',
    USER_ADMIN: 'People administrator',
    INVENTORY_ADMIN: 'Inventory administrator',
    FINANCE_ADMIN: 'Finance administrator',
    REPORTING_ADMIN: 'Reports administrator',
    OPERATIONS_ADMIN: 'Operations administrator',
    AUDIT_ADMIN: 'Audit administrator',
  };
  return labels[value ?? ''] ?? 'Administrator';
}
