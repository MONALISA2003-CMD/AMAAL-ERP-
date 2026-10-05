export type AmaalModule = {
  key: string;
  label: string;
  href: string;
  description: string;
};

// The complete top-level business navigation. Server authorization remains
// the security boundary; this registry keeps the UI from hiding real modules.
export const AMAAL_MODULES: readonly AmaalModule[] = [
  { key: 'command-center', label: 'Command Center', href: '/dashboard', description: 'See the health and performance of the business.' },
  { key: 'people', label: 'People & Structure', href: '/organization', description: 'Manage people, teams, regions and shops.' },
  { key: 'inventory', label: 'Inventory & Devices', href: '/inventory', description: 'Control stock, devices, custody and transfers.' },
  { key: 'customers', label: 'Customers', href: '/customers', description: 'Manage customer records and ownership.' },
  { key: 'sales', label: 'Sales & Receipts', href: '/sales', description: 'Record sales, payments and receipts.' },
  { key: 'finance', label: 'Finance', href: '/finance', description: 'Review commissions, rewards, payments and finance rules.' },
  { key: 'recovery', label: 'Recovery', href: '/recovery', description: 'Manage overdue stock and recovery work.' },
  { key: 'reports', label: 'Reports', href: '/reports', description: 'Review operational performance and comparisons.' },
  { key: 'intelligence', label: 'Planning Insights', href: '/intelligence', description: 'Review forecasts, risks and planning signals.' },
  { key: 'ai', label: 'Amaal AI', href: '/ai', description: 'Ask Amaal for governed business assistance.' },
];
