import type { AuthorizationContext } from '@amaal/permissions';

export type AmaalAIRisk = 'LOW'|'MEDIUM'|'HIGH'|'CRITICAL';
export const AI_GOVERNANCE_VERSION = '8.2';
export const AI_TOOL_POLICY_VERSION = '2026-10-04.2';
export type AmaalAIAutonomy = 0|1|2|3|4|5;
export type AmaalAIAgent = 'CORE'|'SALES'|'INVENTORY'|'RECOVERY'|'FINANCE'|'CUSTOMER'|'KNOWLEDGE';

export type AmaalAIToolName =
  | 'get_my_stock'
  | 'get_team_stock'
  | 'get_region_stock'
  | 'find_imei'
  | 'get_imei_history'
  | 'get_sales'
  | 'get_commission'
  | 'get_aging'
  | 'get_recovery_queue'
  | 'get_customer'
  | 'compare_performance'
  | 'generate_report'
  | 'search_knowledge'
  | 'get_demand_forecast'
  | 'get_aging_risk'
  | 'get_recovery_priority'
  | 'get_stock_optimization'
  | 'get_anomalies'
  | 'create_task'
  | 'create_recovery_case'
  | 'prepare_transfer_request'
  | 'prepare_adjustment_request'
  | 'prepare_approval_request';

export type AmaalAIToolPolicy = {
  name: AmaalAIToolName;
  agent: AmaalAIAgent;
  risk: AmaalAIRisk;
  autonomy: AmaalAIAutonomy;
  description: string;
  requiredPermissions: readonly string[];
  parameters: Record<string, unknown>;
  strict?: boolean;
};

const objectSchema = (properties: Record<string, unknown>, required: readonly string[]): Record<string, unknown> => ({
  type: 'object',
  properties,
  required,
  additionalProperties: false,
});

const string = (description: string): Record<string, unknown> => ({ type: 'string', description });
const nullableString = (description: string): Record<string, unknown> => ({ anyOf: [{ type: 'string' }, { type: 'null' }], description });
const integer = (description: string): Record<string, unknown> => ({ type: 'integer', description });

export const AI_TOOL_POLICIES: Readonly<Record<AmaalAIToolName, AmaalAIToolPolicy>> = {
  get_my_stock: {
    name:'get_my_stock', agent:'INVENTORY', risk:'LOW', autonomy:1,
    description:'Return current inventory held by the authenticated user. Never widen the scope.',
    requiredPermissions:['inventory.view'], parameters:objectSchema({},[]),
  },
  get_team_stock: {
    name:'get_team_stock', agent:'INVENTORY', risk:'LOW', autonomy:1,
    description:'Return current stock held by a team inside the authenticated user scope.',
    requiredPermissions:['inventory.view'], parameters:objectSchema({teamId:string('Authorized Amaal team id.')},['teamId']),
  },
  get_region_stock: {
    name:'get_region_stock', agent:'INVENTORY', risk:'LOW', autonomy:1,
    description:'Return current stock in an authorized region.',
    requiredPermissions:['inventory.view'], parameters:objectSchema({regionId:string('Authorized Amaal region id.')},['regionId']),
  },
  find_imei: {
    name:'find_imei', agent:'INVENTORY', risk:'LOW', autonomy:1,
    description:'Find an IMEI only when its existence is inside the caller authorization scope.',
    requiredPermissions:['inventory.view'], parameters:objectSchema({imei:string('IMEI or device serial to search.')},['imei']),
  },
  get_imei_history: {
    name:'get_imei_history', agent:'INVENTORY', risk:'LOW', autonomy:1,
    description:'Return authorized custody and movement history for an IMEI.',
    requiredPermissions:['inventory.view'], parameters:objectSchema({imeiId:string('Amaal IMEI unit id.')},['imeiId']),
  },
  get_sales: {
    name:'get_sales', agent:'SALES', risk:'LOW', autonomy:1,
    description:'Return completed or reversed sales inside the caller authorization scope.',
    requiredPermissions:['sales.view'], parameters:objectSchema({limit:integer('Maximum number of rows.')},['limit']),
  },
  get_commission: {
    name:'get_commission', agent:'FINANCE', risk:'LOW', autonomy:1,
    description:'Return commission history inside the caller authorization scope.',
    requiredPermissions:['commissions.view'], parameters:objectSchema({userId:nullableString('Optional authorized beneficiary user id.')},['userId']),
  },
  get_aging: {
    name:'get_aging', agent:'RECOVERY', risk:'LOW', autonomy:1,
    description:'Return authorized non-sold inventory aging exposure.',
    requiredPermissions:['inventory.view'], parameters:objectSchema({},[]),
  },
  get_recovery_queue: {
    name:'get_recovery_queue', agent:'RECOVERY', risk:'LOW', autonomy:1,
    description:'Return open recovery cases in the caller authorization scope.',
    requiredPermissions:['recovery.view'], parameters:objectSchema({},[]),
  },
  get_customer: {
    name:'get_customer', agent:'CUSTOMER', risk:'LOW', autonomy:1,
    description:'Return customer details only when the caller is authorized to view that customer.',
    requiredPermissions:['customers.view'], parameters:objectSchema({customerId:string('Authorized customer id.')},['customerId']),
  },
  compare_performance: {
    name:'compare_performance', agent:'SALES', risk:'MEDIUM', autonomy:2,
    description:'Compare authorized seller performance using Amaal reporting truth.',
    requiredPermissions:['reports.view','sales.view'], parameters:objectSchema({limit:integer('Maximum grouped rows.')},['limit']),
  },
  generate_report: {
    name:'generate_report', agent:'CORE', risk:'MEDIUM', autonomy:2,
    description:'Generate a governed operational summary from authorized Amaal records.',
    requiredPermissions:['reports.view'], parameters:objectSchema({report:{type:'string',enum:['sales_summary','inventory_summary','recovery_summary','commission_summary']}},['report']),
  },
  search_knowledge: {
    name:'search_knowledge', agent:'KNOWLEDGE', risk:'LOW', autonomy:1,
    description:'Search approved Amaal knowledge documents. Results are filtered by the current user scope.',
    requiredPermissions:['ai.knowledge.view'], parameters:objectSchema({query:string('Question or terms to search in approved company knowledge.'),limit:integer('Maximum documents to return.')},['query','limit']),
  },
  get_demand_forecast: {
    name:'get_demand_forecast', agent:'SALES', risk:'LOW', autonomy:1,
    description:'Read the latest governed Stage 9 demand forecast for authorized products/regions. Prediction output is advisory, not ERP fact.',
    requiredPermissions:['ai.intelligence.view','reports.view'], parameters:objectSchema({limit:integer('Maximum prediction rows.')},['limit']),
  },
  get_aging_risk: {
    name:'get_aging_risk', agent:'RECOVERY', risk:'LOW', autonomy:1,
    description:'Read the latest governed Stage 9 aging-risk predictions within the caller scope. Predictions never change recovery or suspension state.',
    requiredPermissions:['ai.intelligence.view','inventory.view'], parameters:objectSchema({limit:integer('Maximum prediction rows.')},['limit']),
  },
  get_recovery_priority: {
    name:'get_recovery_priority', agent:'RECOVERY', risk:'LOW', autonomy:1,
    description:'Read advisory recovery prioritization signals for authorized recovery work.',
    requiredPermissions:['ai.intelligence.view','recovery.view'], parameters:objectSchema({limit:integer('Maximum prediction rows.')},['limit']),
  },
  get_stock_optimization: {
    name:'get_stock_optimization', agent:'INVENTORY', risk:'LOW', autonomy:1,
    description:'Read advisory stock optimization predictions. No transfer or inventory mutation is performed.',
    requiredPermissions:['ai.intelligence.view','inventory.view'], parameters:objectSchema({limit:integer('Maximum prediction rows.')},['limit']),
  },
  get_anomalies: {
    name:'get_anomalies', agent:'SALES', risk:'LOW', autonomy:1,
    description:'Read governed anomaly signals for authorized operational data.',
    requiredPermissions:['ai.intelligence.view','reports.view'], parameters:objectSchema({limit:integer('Maximum prediction rows.')},['limit']),
  },
  create_task: {
    name:'create_task', agent:'CORE', risk:'HIGH', autonomy:3,
    description:'Prepare a governed operational task. The tool does not execute a business mutation.',
    requiredPermissions:['ai.execute'], parameters:objectSchema({assignedTo:nullableString('Optional authorized assignee.'),taskType:string('Amaal task type.'),priority:integer('Task priority.'),dueAt:nullableString('Optional due timestamp.'),resourceType:nullableString('Optional Amaal resource type.'),resourceId:nullableString('Optional Amaal resource id.'),notes:nullableString('Task notes.')},['assignedTo','taskType','priority','dueAt','resourceType','resourceId','notes']),
  },
  create_recovery_case: {
    name:'create_recovery_case', agent:'RECOVERY', risk:'HIGH', autonomy:3,
    description:'Prepare a recovery-case creation using the normal recovery service boundary. A business mutation is not executed at tool-call time.',
    requiredPermissions:['ai.execute','recovery.assign'], parameters:objectSchema({imeiId:string('Field-held IMEI to place into recovery.'),customerId:nullableString('Optional authorized customer id.'),reason:string('Recovery reason.'),priority:integer('Non-negative recovery priority.'),dueAt:nullableString('Optional recovery due timestamp.'),notes:nullableString('Optional operational notes.')},['imeiId','customerId','reason','priority','dueAt','notes']),
  },
  prepare_transfer_request: {
    name:'prepare_transfer_request', agent:'INVENTORY', risk:'HIGH', autonomy:3,
    description:'Prepare an inventory transfer request. Stock is not moved by Amaal AI.',
    requiredPermissions:['ai.execute','inventory.transfer'], parameters:objectSchema({imeiIds:{type:'array',items:{type:'string'},minItems:1,maxItems:100},targetKind:{type:'string',enum:['WAREHOUSE','MANAGER','TEAM','AGENT','SHOP']},targetId:string('Authorized destination identifier.'),reason:string('Transfer reason.')},['imeiIds','targetKind','targetId','reason']),
  },
  prepare_adjustment_request: {
    name:'prepare_adjustment_request', agent:'INVENTORY', risk:'HIGH', autonomy:3,
    description:'Prepare an inventory adjustment request for the approval workflow. Stock is not mutated by Amaal AI.',
    requiredPermissions:['ai.execute','inventory.adjust'], parameters:objectSchema({imeiId:string('Authorized IMEI unit id.'),targetState:string('Requested target inventory state.'),reason:string('Adjustment reason.'),targetHolderUserId:nullableString('Optional target holder.'),targetWarehouseId:nullableString('Optional target warehouse.'),targetRegionId:nullableString('Optional target region.'),targetTeamId:nullableString('Optional target team.'),targetShopId:nullableString('Optional target shop.')},['imeiId','targetState','reason','targetHolderUserId','targetWarehouseId','targetRegionId','targetTeamId','targetShopId']),
  },
  prepare_approval_request: {
    name:'prepare_approval_request', agent:'CORE', risk:'HIGH', autonomy:3,
    description:'Prepare a human approval request for an already-defined Amaal action. The AI cannot approve the request.',
    requiredPermissions:['ai.execute','approvals.view'], strict:false, parameters:objectSchema({approvalType:string('Amaal approval type.'),targetType:string('Amaal target type.'),targetId:string('Amaal target id.'),reason:string('Approval reason.'),requestedChanges:{type:'object',additionalProperties:true}},['approvalType','targetType','targetId','reason','requestedChanges']),
  },
};

export const AI_AUTONOMY_LABELS: Readonly<Record<AmaalAIAutonomy,string>> = {
  0:'Observe', 1:'Explain', 2:'Recommend', 3:'Prepare draft/task/request', 4:'Policy-approved execute', 5:'Human-approved critical execute',
};

export function policyForTool(tool: AmaalAIToolName): AmaalAIToolPolicy { return AI_TOOL_POLICIES[tool]; }

export function authorizedToolNames(context: AuthorizationContext, candidateNames: readonly AmaalAIToolName[]): AmaalAIToolName[] {
  const result: AmaalAIToolName[] = [];
  if (!context.permissions.includes('ai.use') && !context.roles.includes('CEO')) return result;
  for (const name of candidateNames) {
    const policy = AI_TOOL_POLICIES[name];
    if (context.roles.includes('CEO') || policy.requiredPermissions.every((permission) => context.permissions.includes(permission) || context.roles.includes('CEO'))) {
      result.push(name);
    }
  }
  return result;
}

export function toOpenAITools(names: readonly AmaalAIToolName[]): Record<string, unknown>[] {
  return names.map((name) => {
    const policy = AI_TOOL_POLICIES[name];
    return { type:'function', name:policy.name, description:policy.description, parameters:policy.parameters, strict:policy.strict ?? true };
  });
}
