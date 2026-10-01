import { timingSafeEqual } from 'node:crypto';
import type { ApiServices } from './index.ts';

export type SetupStage = 'NOT_STARTED' | 'ORGANIZATION_READY' | 'ACTIVATED';


export class SetupError extends Error {
  public readonly code: string;
  public readonly status: number;

  constructor(code: string, message: string, status: number) {
    super(message);
    this.name = 'SetupError';
    this.code = code;
    this.status = status;
  }
}

export type SetupRegionInput = {
  code: string;
  name: string;
};

export type SetupWarehouseInput = {
  code: string;
  name: string;
  regionCode: string;
};

export type SetupInitializeInput = {
  activationCode: string;
  ceoEmail: string;
  ceoDisplayName: string;
  ceoEmployeeNumber?: string;
  regions: SetupRegionInput[];
  regionalWarehouses: SetupWarehouseInput[];
};

export type SetupStatus = {
  stage: SetupStage;
  setupRequired: boolean;
  organization: {
    id: string;
    name: string;
  };
  masterWarehouse: {
    id: string;
    code: string;
    name: string;
  } | null;
  regions: Array<{
    id: string;
    code: string;
    name: string;
  }>;
  pendingCeo: {
    email: string;
    displayName: string;
    employeeNumber: string | null;
  } | null;
};

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const CODE_PATTERN = /^[A-Za-z0-9][A-Za-z0-9_-]{1,31}$/;
const MAX_REGIONS = 50;
const MAX_REGIONAL_WAREHOUSES = 50;

function clean(value: unknown, label: string, maxLength: number): string {
  if (typeof value !== 'string') throw new Error(`${label} is required.`);
  const normalized = value.trim();
  if (!normalized) throw new Error(`${label} is required.`);
  if (normalized.length > maxLength) throw new Error(`${label} is too long.`);
  return normalized;
}

function normalizeCode(value: unknown, label: string): string {
  const code = clean(value, label, 32).toUpperCase();
  if (!CODE_PATTERN.test(code)) throw new Error(`${label} contains unsupported characters.`);
  return code;
}

export function validateSetupInitializeInput(body: Record<string, unknown>): SetupInitializeInput {
  const activationCode = clean(body.activationCode, 'activationCode', 128);
  const ceoEmail = clean(body.ceoEmail, 'ceoEmail', 254).toLowerCase();
  if (!EMAIL_PATTERN.test(ceoEmail)) throw new Error('ceoEmail must be a valid email address.');
  const ceoDisplayName = clean(body.ceoDisplayName, 'ceoDisplayName', 120);
  const ceoEmployeeNumber = typeof body.ceoEmployeeNumber === 'string' && body.ceoEmployeeNumber.trim()
    ? clean(body.ceoEmployeeNumber, 'ceoEmployeeNumber', 64)
    : undefined;

  if (!Array.isArray(body.regions)) throw new Error('regions must be an array.');
  if (body.regions.length > MAX_REGIONS) throw new Error(`Amaal supports at most ${MAX_REGIONS} setup regions.`);
  const regions = body.regions.map((raw, index) => {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw new Error(`regions[${index}] is invalid.`);
    const value = raw as Record<string, unknown>;
    return { code: normalizeCode(value.code, `regions[${index}].code`), name: clean(value.name, `regions[${index}].name`, 120) };
  });
  if (regions.length === 0) throw new Error('At least one operating region is required.');

  const regionCodes = new Set<string>();
  const regionNames = new Set<string>();
  for (const region of regions) {
    if (regionCodes.has(region.code)) throw new Error(`Region code ${region.code} is duplicated.`);
    if (regionNames.has(region.name.toLowerCase())) throw new Error(`Region name ${region.name} is duplicated.`);
    regionCodes.add(region.code);
    regionNames.add(region.name.toLowerCase());
  }

  if (!Array.isArray(body.regionalWarehouses)) throw new Error('regionalWarehouses must be an array.');
  if (body.regionalWarehouses.length > MAX_REGIONAL_WAREHOUSES) throw new Error(`Amaal supports at most ${MAX_REGIONAL_WAREHOUSES} regional warehouses in setup.`);
  const regionalWarehouses = body.regionalWarehouses.map((raw, index) => {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw new Error(`regionalWarehouses[${index}] is invalid.`);
    const value = raw as Record<string, unknown>;
    const regionCode = normalizeCode(value.regionCode, `regionalWarehouses[${index}].regionCode`);
    if (!regionCodes.has(regionCode)) throw new Error(`Regional warehouse ${index + 1} references an unknown region.`);
    return {
      code: normalizeCode(value.code, `regionalWarehouses[${index}].code`),
      name: clean(value.name, `regionalWarehouses[${index}].name`, 120),
      regionCode,
    };
  });

  const warehouseCodes = new Set<string>();
  for (const warehouse of regionalWarehouses) {
    if (warehouseCodes.has(warehouse.code)) throw new Error(`Regional warehouse code ${warehouse.code} is duplicated.`);
    warehouseCodes.add(warehouse.code);
  }

  return { activationCode, ceoEmail, ceoDisplayName, ceoEmployeeNumber, regions, regionalWarehouses };
}

function activationMatches(provided: string, expected: string | undefined): boolean {
  if (!expected) return false;
  const left = Buffer.from(provided, 'utf8');
  const right = Buffer.from(expected, 'utf8');
  return left.length === right.length && timingSafeEqual(left, right);
}

export async function getAmaalSetupStatus(services: ApiServices): Promise<SetupStatus> {
  const orgResult = await services.pool.query<{
    organization_id: string;
    organization_name: string;
    master_warehouse_id: string | null;
    master_warehouse_code: string | null;
    master_warehouse_name: string | null;
    setup: unknown;
    profile_count: string;
  }>(`
    select
      o.id as organization_id,
      o.name as organization_name,
      mw.id as master_warehouse_id,
      mw.warehouse_code as master_warehouse_code,
      mw.warehouse_name as master_warehouse_name,
      coalesce(cs.settings -> 'setup', '{}'::jsonb) as setup,
      (select count(*)::text from public.profiles p where p.organization_id = o.id) as profile_count
    from public.organizations o
    left join public.company_settings cs on cs.organization_id = o.id
    left join lateral (
      select id, warehouse_code, warehouse_name
      from public.warehouses
      where organization_id = o.id and warehouse_type = 'MASTER' and status = 'ACTIVE'
      order by created_at asc
      limit 1
    ) mw on true
    order by o.created_at asc
    limit 1
  `);

  const row = orgResult.rows[0];
  if (!row) throw new Error('Amaal organization foundation is not available.');

  const regionResult = await services.pool.query<{ id: string; code: string; name: string }>(`
    select id, region_code as code, region_name as name
    from public.regions
    where organization_id = $1 and status = 'ACTIVE'
    order by region_name asc
  `, [row.organization_id]);

  const rawSetup = row.setup && typeof row.setup === 'object' && !Array.isArray(row.setup)
    ? row.setup as Record<string, unknown>
    : {};
  const storedStage = rawSetup.stage;
  const stage: SetupStage = storedStage === 'ACTIVATED'
    ? 'ACTIVATED'
    : storedStage === 'ORGANIZATION_READY' || Number(row.profile_count) > 0
      ? Number(row.profile_count) > 0 ? 'ACTIVATED' : 'ORGANIZATION_READY'
      : 'NOT_STARTED';

  const pendingCeo = rawSetup.pendingCeo && typeof rawSetup.pendingCeo === 'object' && !Array.isArray(rawSetup.pendingCeo)
    ? rawSetup.pendingCeo as Record<string, unknown>
    : null;

  return {
    stage,
    setupRequired: stage !== 'ACTIVATED',
    organization: { id: row.organization_id, name: row.organization_name },
    masterWarehouse: row.master_warehouse_id
      ? { id: row.master_warehouse_id, code: row.master_warehouse_code ?? '', name: row.master_warehouse_name ?? '' }
      : null,
    regions: regionResult.rows,
    pendingCeo: pendingCeo && typeof pendingCeo.email === 'string' && typeof pendingCeo.displayName === 'string'
      ? {
        email: pendingCeo.email,
        displayName: pendingCeo.displayName,
        employeeNumber: typeof pendingCeo.employeeNumber === 'string' ? pendingCeo.employeeNumber : null,
      }
      : null,
  };
}

export async function initializeAmaalOrganization(
  services: ApiServices,
  requestId: string,
  input: SetupInitializeInput,
): Promise<{ organizationId: string; stage: 'ORGANIZATION_READY'; regionIds: string[]; warehouseIds: string[] }> {
  const expectedKey = process.env.AMAAL_SETUP_KEY?.trim();
  if (!expectedKey) throw new SetupError('SETUP_UNAVAILABLE', 'Amaal setup is not currently available.', 503);
  if (!activationMatches(input.activationCode, expectedKey)) throw new SetupError('INVALID_ACTIVATION_CODE', 'The activation code is not valid.', 403);

  const client = await services.pool.connect();
  try {
    await client.query('begin');
    await client.query(`select pg_advisory_xact_lock(hashtextextended('amaal:first-run-setup', 0))`);

    const foundation = await client.query<{
      organization_id: string;
      organization_name: string;
      settings: Record<string, unknown>;
    }>(`
      select
        o.id as organization_id,
        o.name as organization_name,
        coalesce(cs.settings, '{}'::jsonb) as settings
      from public.organizations o
      left join public.company_settings cs on cs.organization_id = o.id
      order by o.created_at asc
      limit 1
      for update of o
    `);

    const row = foundation.rows[0];
    if (!row) throw new Error('Amaal organization foundation is not available.');
    const profileCount = await client.query<{ count: string }>(`
      select count(*)::text as count
      from public.profiles
      where organization_id = $1
    `, [row.organization_id]);
    const currentSetup = row.settings?.setup && typeof row.settings.setup === 'object' && !Array.isArray(row.settings.setup)
      ? row.settings.setup as Record<string, unknown>
      : {};
    const currentStage = currentSetup.stage;
    if (currentStage === 'ORGANIZATION_READY' || currentStage === 'ACTIVATED' || Number(profileCount.rows[0]?.count ?? 0) > 0) {
      throw new SetupError('SETUP_ALREADY_COMPLETED', 'Amaal setup has already been completed.', 409);
    }

    const existingRegionRows = await client.query<{ id: string; code: string; name: string }>(`
      select id, region_code as code, region_name as name
      from public.regions
      where organization_id = $1 and status = 'ACTIVE'
      for update
    `, [row.organization_id]);
    const existingRegionsByCode = new Map(existingRegionRows.rows.map((region) => [region.code.toUpperCase(), region]));
    const existingRegionsByName = new Map(existingRegionRows.rows.map((region) => [region.name.toLowerCase(), region]));
    const regionIds: string[] = [];
    const regionIdByCode = new Map<string, string>();

    for (const region of input.regions) {
      const existing = existingRegionsByCode.get(region.code) ?? existingRegionsByName.get(region.name.toLowerCase());
      if (existing) {
        if (existing.name.toLowerCase() !== region.name.toLowerCase() || existing.code.toUpperCase() !== region.code) {
          throw new Error(`Region ${region.code} already exists with different details.`);
        }
        regionIds.push(existing.id);
        regionIdByCode.set(region.code, existing.id);
        continue;
      }

      const created = await client.query<{ id: string }>(`
        insert into public.regions (organization_id, region_code, region_name)
        values ($1, $2, $3)
        returning id
      `, [row.organization_id, region.code, region.name]);
      const id = created.rows[0]?.id;
      if (!id) throw new Error(`Could not create region ${region.name}.`);
      regionIds.push(id);
      regionIdByCode.set(region.code, id);
    }

    const warehouseIds: string[] = [];
    for (const warehouse of input.regionalWarehouses) {
      const regionId = regionIdByCode.get(warehouse.regionCode);
      if (!regionId) throw new Error(`Region ${warehouse.regionCode} could not be resolved.`);
      const existing = await client.query<{ id: string; region_id: string; warehouse_name: string }>(`
        select id, region_id, warehouse_name
        from public.warehouses
        where organization_id = $1 and warehouse_code = $2 and warehouse_type = 'REGIONAL'
        limit 1
        for update
      `, [row.organization_id, warehouse.code]);
      if (existing.rows[0]) {
        const current = existing.rows[0];
        if (current.region_id !== regionId || current.warehouse_name.toLowerCase() !== warehouse.name.toLowerCase()) {
          throw new Error(`Regional warehouse ${warehouse.code} already exists with different details.`);
        }
        warehouseIds.push(current.id);
        continue;
      }
      const created = await client.query<{ id: string }>(`
        insert into public.warehouses (organization_id, warehouse_code, warehouse_name, warehouse_type, region_id)
        values ($1, $2, $3, 'REGIONAL', $4)
        returning id
      `, [row.organization_id, warehouse.code, warehouse.name, regionId]);
      const id = created.rows[0]?.id;
      if (!id) throw new Error(`Could not create regional warehouse ${warehouse.name}.`);
      warehouseIds.push(id);
    }

    const setupState = {
      ...currentSetup,
      version: 1,
      stage: 'ORGANIZATION_READY',
      completedAt: new Date().toISOString(),
      requestId,
      pendingCeo: {
        email: input.ceoEmail,
        displayName: input.ceoDisplayName,
        employeeNumber: input.ceoEmployeeNumber ?? null,
      },
      foundation: {
        masterWarehouseReady: Boolean((await client.query(`select 1 from public.warehouses where organization_id = $1 and warehouse_type = 'MASTER' and status = 'ACTIVE' limit 1`, [row.organization_id])).rowCount),
        regionIds,
        warehouseIds,
      },
      policyReadiness: {
        pricing: 'PENDING_CONFIGURATION',
        commission: 'PENDING_CONFIGURATION',
        bonus: 'PENDING_CONFIGURATION',
        aging: 'PENDING_CONFIGURATION',
        recovery: 'PENDING_CONFIGURATION',
        approvals: 'PENDING_CONFIGURATION',
      },
    };

    await client.query(`
      update public.company_settings
      set settings = $2::jsonb,
          updated_at = now()
      where organization_id = $1
    `, [row.organization_id, JSON.stringify({ ...(row.settings ?? {}), setup: setupState })]);

    await client.query(`
      insert into public.audit_events(action,target_type,target_id,new_state,reason,request_id)
      values ('AMAAL_ORGANIZATION_SETUP_COMPLETED','ORGANIZATION',$1,$2::jsonb,'Initial Amaal organization setup completed before identity activation',$3)
    `, [row.organization_id, JSON.stringify({ stage: 'ORGANIZATION_READY', region_count: regionIds.length, regional_warehouse_count: warehouseIds.length }), requestId]);

    await client.query(`
      insert into public.outbox_events(event_type,aggregate_type,aggregate_id,payload,schema_version)
      values ('ORGANIZATION_SETUP_COMPLETED','ORGANIZATION',$1,$2::jsonb,1)
    `, [row.organization_id, JSON.stringify({ request_id: requestId, stage: 'ORGANIZATION_READY', region_ids: regionIds, warehouse_ids: warehouseIds })]);

    await client.query('commit');
    return { organizationId: row.organization_id, stage: 'ORGANIZATION_READY', regionIds, warehouseIds };
  } catch (error) {
    await client.query('rollback');
    throw error;
  } finally {
    client.release();
  }
}
