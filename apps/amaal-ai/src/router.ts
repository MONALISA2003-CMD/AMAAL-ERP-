import type { AmaalAIToolName, AmaalAIRisk, AmaalAIAgent } from './contracts.ts';

export type AmaalAIRoute = {
  intent: string;
  agent: AmaalAIAgent;
  risk: AmaalAIRisk;
  candidateTools: AmaalAIToolName[];
  rationale: string;
};

const includesAny = (value: string, words: readonly string[]) => words.some((word) => value.includes(word));

export function routeAmaalAI(input: string): AmaalAIRoute {
  const q = input.trim().toLowerCase();
  const critical = includesAny(q, ['delete ', 'delete\n', 'write off', 'financial correction', 'password', 'security setting', 'change role', 'change permission', 'disable user']);
  if (critical) {
    return { intent:'critical_operation', agent:'CORE', risk:'CRITICAL', candidateTools:['generate_report','search_knowledge'], rationale:'Critical or privileged operation detected; Stage 8 keeps the AI observation/recommendation-only.' };
  }
  const actionRequested = /^(please\s+)?(?:create|open|prepare|assign|transfer|adjust|allocate|move|submit|raise|request)\b/.test(q)
    || /\b(?:can you|could you|i want to|i need to|please)\s+(?:create|open|prepare|assign|transfer|adjust|allocate|move|submit|raise|request)\b/.test(q);

  const hasRecovery = includesAny(q,['recovery','recover','overdue return','aged stock','aging exposure','aging risk']);
  const hasInventory = includesAny(q,['stock','inventory','imei','device','warehouse','allocation','transfer']);
  const hasFinance = includesAny(q,['commission','bonus','finance','payment','revenue','cash','loan']);
  const hasCustomer = includesAny(q,['customer','client','buyer']);
  const hasSales = includesAny(q,['sales','sale','seller','agent performance','team performance','manager performance','region performance','why did sales','performance','target','forecast','velocity','anomal']);
  const domainCount = [hasRecovery,hasInventory,hasFinance,hasCustomer,hasSales].filter(Boolean).length;

  if (hasRecovery && actionRequested && includesAny(q,['recovery case','recovery request','recover'])) {
    return { intent:'recovery_intelligence', agent:'RECOVERY', risk:'HIGH', candidateTools:['get_aging','get_recovery_queue','get_my_stock','generate_report','search_knowledge','create_recovery_case'], rationale:'Explicit recovery action takes precedence over incidental device/stock words; only the governed recovery preparation tool is exposed.' };
  }

  if (domainCount >= 2) {
    const candidateTools: AmaalAIToolName[] = ['generate_report','search_knowledge'];
    if (hasRecovery) candidateTools.push('get_aging','get_recovery_queue');
    if (hasInventory) candidateTools.push('get_my_stock','get_team_stock','get_region_stock','find_imei','get_imei_history');
    if (hasFinance) candidateTools.push('get_commission','get_sales');
    if (hasCustomer) candidateTools.push('get_customer');
    if (hasSales) candidateTools.push('get_sales','compare_performance','get_demand_forecast','get_anomalies');
    if (actionRequested && hasRecovery) candidateTools.push('create_recovery_case');
    if (actionRequested && hasInventory) candidateTools.push('prepare_transfer_request','prepare_adjustment_request');
    return {
      intent:'cross_domain_intelligence',
      agent:'CORE',
      risk:actionRequested ? 'HIGH':'LOW',
      candidateTools:[...new Set(candidateTools)],
      rationale: actionRequested ? 'Cross-domain request includes an operational action; only scoped read tools plus minimum preparation tools are exposed.' : 'Cross-domain operational question routed to a union of governed read tools.'
    };
  }

  if (hasRecovery) {
    const candidateTools: AmaalAIToolName[] = ['get_aging','get_recovery_queue','get_my_stock','get_aging_risk','get_recovery_priority','generate_report','search_knowledge'];
    if (actionRequested) candidateTools.push('create_recovery_case');
    return { intent:'recovery_intelligence', agent:'RECOVERY', risk: actionRequested ? 'HIGH':'LOW', candidateTools, rationale: actionRequested ? 'Recovery request includes an operational action; only the recovery prepare tool is exposed in addition to read tools.' : 'Recovery/aging request routed to read-only governed recovery tools.' };
  }
  if (hasInventory) {
    const candidateTools: AmaalAIToolName[] = ['get_my_stock','get_team_stock','get_region_stock','find_imei','get_imei_history','get_aging','get_aging_risk','get_stock_optimization','generate_report','search_knowledge'];
    if (actionRequested) {
      candidateTools.push('prepare_transfer_request','prepare_adjustment_request');
    }
    return { intent:'inventory_intelligence', agent:'INVENTORY', risk: actionRequested ? 'HIGH':'LOW', candidateTools, rationale: actionRequested ? 'Inventory request includes an operational action; only the minimum prepare tools are exposed.' : 'Inventory request routed to read-only governed inventory tools.' };
  }
  if (hasFinance) {
    return { intent:'finance_intelligence', agent:'FINANCE', risk:'LOW', candidateTools:['get_commission','get_sales','generate_report','search_knowledge'], rationale:'Finance request routed to read-only financial/reporting tools in Stage 8.' };
  }
  if (hasCustomer) {
    return { intent:'customer_intelligence', agent:'CUSTOMER', risk:'LOW', candidateTools:['get_customer','get_sales','search_knowledge'], rationale:'Customer request routed to permission-aware customer tools.' };
  }
  if (hasSales) {
    return { intent:'sales_intelligence', agent:'SALES', risk:'MEDIUM', candidateTools:['get_sales','compare_performance','get_demand_forecast','get_anomalies','generate_report','get_aging','get_aging_risk','search_knowledge'], rationale:'Sales/performance request routed to governed reporting tools.' };
  }
  return { intent:'general_operations', agent:'CORE', risk:'LOW', candidateTools:['generate_report','get_sales','get_my_stock','get_aging','get_demand_forecast','get_aging_risk','get_recovery_priority','get_anomalies','search_knowledge'], rationale:'General operational question routed to safe read-only tools.' };
}
