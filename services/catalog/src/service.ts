import type { DatabaseTransaction } from '@amaal/database';
import { loadAuthorizationContext } from '@amaal/permissions';
import { AuthorizationError, ConflictError, ValidationError } from '@amaal/shared';

const MAX_IMEI_BATCH = 250;
const IMEI_PATTERN = /^\d{15}$/;

type CatalogActor = Awaited<ReturnType<typeof loadAuthorizationContext>>;

function requirePermission(context: CatalogActor, permission: string): void {
  if (context.roles.includes('CEO')) return;
  if (!context.permissions.includes(permission)) throw new AuthorizationError(`Missing permission: ${permission}`);
}

function normalizeImei(value: string): string {
  const imei = value.trim();
  if (!IMEI_PATTERN.test(imei)) throw new ValidationError('IMEI must contain exactly 15 digits.');
  return imei;
}

async function organizationIdForActor(tx: DatabaseTransaction, actorUserId: string): Promise<string> {
  const rows = await tx.query<{ organization_id: string }>(`select organization_id from public.profiles where user_id=$1 and status='ACTIVE'`, [actorUserId]);
  if (rows.length !== 1) throw new AuthorizationError('Actor is not linked to an active Amaal organization.');
  return rows[0]!.organization_id;
}

export class PostgresCatalogService {
  async listBrands(tx: DatabaseTransaction, actorUserId: string) {
    const context = await loadAuthorizationContext(tx, actorUserId);
    requirePermission(context, 'products.view');
    const organizationId = await organizationIdForActor(tx, actorUserId);
    return tx.query(`
      select b.id,b.brand_name as "brandName",b.status,b.created_at as "createdAt"
      from public.brands b
      where b.organization_id=$1
      order by b.brand_name asc
    `, [organizationId]);
  }

  async listProducts(tx: DatabaseTransaction, actorUserId: string, query = '') {
    const context = await loadAuthorizationContext(tx, actorUserId);
    requirePermission(context, 'products.view');
    const organizationId = await organizationIdForActor(tx, actorUserId);
    const q = query.trim().toLowerCase();
    return tx.query(`
      select
        p.id,
        p.model_name as "modelName",
        p.category,
        p.description,
        p.status,
        b.id as "brandId",
        b.brand_name as "brandName",
        coalesce(json_agg(json_build_object(
          'id',pv.id,
          'sku',pv.sku,
          'ram',pv.ram,
          'storage',pv.storage,
          'color',pv.color,
          'network',pv.network,
          'display',pv.display,
          'battery',pv.battery,
          'camera',pv.camera,
          'processor',pv.processor,
          'operatingSystem',pv.operating_system,
          'warrantyText',pv.warranty_text,
          'otherSpecs',pv.other_specs,
          'status',pv.status
        ) order by pv.sku) filter (where pv.id is not null), '[]'::json) as variants
      from public.products p
      join public.brands b on b.id=p.brand_id
      left join public.product_variants pv on pv.product_id=p.id
      where b.organization_id=$1
        and ($2='' or lower(b.brand_name||' '||p.model_name||' '||coalesce(p.category,'')) like '%'||$2||'%')
      group by p.id,b.id
      order by b.brand_name,p.model_name
      limit 200
    `, [organizationId, q]);
  }

  async createBrand(tx: DatabaseTransaction, actorUserId: string, input: { name: string }) {
    const context = await loadAuthorizationContext(tx, actorUserId);
    requirePermission(context, 'products.create');
    const organizationId = await organizationIdForActor(tx, actorUserId);
    const name = input.name.trim();
    if (!name) throw new ValidationError('Brand name is required.');
    const existing = await tx.query(`select 1 from public.brands where organization_id=$1 and lower(brand_name)=lower($2) limit 1`, [organizationId, name]);
    if (existing.length) throw new ConflictError('Brand already exists.');
    const rows = await tx.query<{ id: string }>(`insert into public.brands(organization_id,brand_name) values($1,$2) returning id`, [organizationId, name]);
    const id = rows[0]?.id;
    if (!id) throw new ValidationError('Brand could not be created.');
    await tx.query(`insert into public.audit_events(actor_user_id,action,target_type,target_id,new_state,reason) values($1,'BRAND_CREATED','BRAND',$2,$3::jsonb,'Phase 3 catalog master data')`, [actorUserId,id,JSON.stringify({name})]);
    await tx.query(`insert into public.outbox_events(event_type,aggregate_type,aggregate_id,actor_user_id,payload) values('BRAND_CREATED','BRAND',$1,$2,$3::jsonb)`, [id,actorUserId,JSON.stringify({brandId:id,name})]);
    return { id, name };
  }


  async updateBrand(tx: DatabaseTransaction, actorUserId: string, brandId: string, input: { name: string }) {
    const context = await loadAuthorizationContext(tx, actorUserId);
    requirePermission(context, 'products.edit');
    const organizationId = await organizationIdForActor(tx, actorUserId);
    const name = input.name.trim();
    if (!name) throw new ValidationError('Brand name is required.');
    const existing = await tx.query(`select id from public.brands where organization_id=$1 and lower(brand_name)=lower($2) and id<>$3 limit 1`, [organizationId, name, brandId]);
    if (existing.length) throw new ConflictError('Another brand with the same name already exists.');
    const rows = await tx.query<{ id: string; brand_name: string; status: string }>(`update public.brands set brand_name=$1,updated_at=now() where id=$2 and organization_id=$3 returning id,brand_name,status`, [name, brandId, organizationId]);
    if (rows.length !== 1) throw new ValidationError('Brand not found in the actor organization.');
    await tx.query(`insert into public.audit_events(actor_user_id,action,target_type,target_id,new_state,reason) values($1,'BRAND_UPDATED','BRAND',$2,$3::jsonb,'Phase 3 catalog master data edit')`, [actorUserId, brandId, JSON.stringify({name})]);
    await tx.query(`insert into public.outbox_events(event_type,aggregate_type,aggregate_id,actor_user_id,payload) values('BRAND_UPDATED','BRAND',$1,$2,$3::jsonb)`, [brandId,actorUserId,JSON.stringify({brandId,name})]);
    return { id: rows[0]!.id, name: rows[0]!.brand_name, status: rows[0]!.status };
  }

  async archiveBrand(tx: DatabaseTransaction, actorUserId: string, brandId: string) {
    const context = await loadAuthorizationContext(tx, actorUserId);
    requirePermission(context, 'products.archive');
    const organizationId = await organizationIdForActor(tx, actorUserId);
    const active = await tx.query(`select 1 from public.products where brand_id=$1 and status='ACTIVE' limit 1`, [brandId]);
    if (active.length) throw new ConflictError('Archive active products under this brand before archiving the brand.');
    const rows = await tx.query<{ id: string; status: string }>(`update public.brands set status='ARCHIVED'::public.record_status,updated_at=now() where id=$1 and organization_id=$2 and status<>'ARCHIVED'::public.record_status returning id,status`, [brandId, organizationId]);
    if (rows.length !== 1) throw new ValidationError('Brand not found or already archived.');
    await tx.query(`insert into public.audit_events(actor_user_id,action,target_type,target_id,new_state,reason) values($1,'BRAND_ARCHIVED','BRAND',$2,$3::jsonb,'Phase 3 catalog master data archive')`, [actorUserId, brandId, JSON.stringify({status:'ARCHIVED'})]);
    await tx.query(`insert into public.outbox_events(event_type,aggregate_type,aggregate_id,actor_user_id,payload) values('BRAND_ARCHIVED','BRAND',$1,$2,$3::jsonb)`, [brandId,actorUserId,JSON.stringify({brandId,status:'ARCHIVED'})]);
    return { id: brandId, status: 'ARCHIVED' as const };
  }

  async createProduct(tx: DatabaseTransaction, actorUserId: string, input: { brandId: string; modelName: string; category?: string; description?: string }) {
    const context = await loadAuthorizationContext(tx, actorUserId);
    requirePermission(context, 'products.create');
    const organizationId = await organizationIdForActor(tx, actorUserId);
    const brand = await tx.query<{ id: string }>(`select id from public.brands where id=$1 and organization_id=$2 and status='ACTIVE'`, [input.brandId, organizationId]);
    if (brand.length !== 1) throw new ValidationError('Brand is not active in the actor organization.');
    const modelName = input.modelName.trim();
    if (!modelName) throw new ValidationError('Model name is required.');
    const existing = await tx.query(`select 1 from public.products where brand_id=$1 and lower(model_name)=lower($2) limit 1`, [input.brandId, modelName]);
    if (existing.length) throw new ConflictError('Product model already exists for this brand.');
    const rows = await tx.query<{ id: string }>(`insert into public.products(brand_id,model_name,category,description) values($1,$2,$3,$4) returning id`, [input.brandId, modelName, input.category?.trim() || null, input.description?.trim() || null]);
    const id = rows[0]?.id;
    if (!id) throw new ValidationError('Product could not be created.');
    await tx.query(`insert into public.audit_events(actor_user_id,action,target_type,target_id,new_state,reason) values($1,'PRODUCT_CREATED','PRODUCT',$2,$3::jsonb,'Phase 3 catalog master data')`, [actorUserId,id,JSON.stringify({brandId:input.brandId,modelName})]);
    await tx.query(`insert into public.outbox_events(event_type,aggregate_type,aggregate_id,actor_user_id,payload) values('PRODUCT_CREATED','PRODUCT',$1,$2,$3::jsonb)`, [id,actorUserId,JSON.stringify({productId:id,brandId:input.brandId,modelName})]);
    return { id, modelName };
  }


  async updateProduct(tx: DatabaseTransaction, actorUserId: string, productId: string, input: { modelName: string; category?: string; description?: string }) {
    const context = await loadAuthorizationContext(tx, actorUserId);
    requirePermission(context, 'products.edit');
    const organizationId = await organizationIdForActor(tx, actorUserId);
    const modelName = input.modelName.trim();
    if (!modelName) throw new ValidationError('Model name is required.');
    const product = await tx.query<{ id:string; brand_id:string }>(`select p.id,p.brand_id from public.products p join public.brands b on b.id=p.brand_id where p.id=$1 and b.organization_id=$2`, [productId, organizationId]);
    if (product.length !== 1) throw new ValidationError('Product not found in the actor organization.');
    const duplicate = await tx.query(`select 1 from public.products where brand_id=$1 and lower(model_name)=lower($2) and id<>$3 limit 1`, [product[0]!.brand_id, modelName, productId]);
    if (duplicate.length) throw new ConflictError('Another product model already exists for this brand.');
    const rows = await tx.query<{ id:string; model_name:string; category:string|null; description:string|null; status:string }>(`update public.products set model_name=$1,category=$2,description=$3,updated_at=now() where id=$4 returning id,model_name,category,description,status`, [modelName,input.category?.trim()||null,input.description?.trim()||null,productId]);
    await tx.query(`insert into public.audit_events(actor_user_id,action,target_type,target_id,new_state,reason) values($1,'PRODUCT_UPDATED','PRODUCT',$2,$3::jsonb,'Phase 3 catalog master data edit')`, [actorUserId,productId,JSON.stringify({modelName,category:input.category?.trim()||null,description:input.description?.trim()||null})]);
    await tx.query(`insert into public.outbox_events(event_type,aggregate_type,aggregate_id,actor_user_id,payload) values('PRODUCT_UPDATED','PRODUCT',$1,$2,$3::jsonb)`, [productId,actorUserId,JSON.stringify({productId,modelName})]);
    return { id:rows[0]!.id, modelName:rows[0]!.model_name, category:rows[0]!.category, description:rows[0]!.description, status:rows[0]!.status };
  }

  async archiveProduct(tx: DatabaseTransaction, actorUserId: string, productId: string) {
    const context = await loadAuthorizationContext(tx, actorUserId);
    requirePermission(context, 'products.archive');
    const organizationId = await organizationIdForActor(tx, actorUserId);
    const rows = await tx.query<{ id:string; status:string }>(`update public.products p set status='ARCHIVED'::public.record_status,updated_at=now() from public.brands b where p.id=$1 and p.brand_id=b.id and b.organization_id=$2 and p.status<>'ARCHIVED'::public.record_status returning p.id,p.status`, [productId,organizationId]);
    if (rows.length !== 1) throw new ValidationError('Product not found or already archived.');
    await tx.query(`update public.product_variants set status='ARCHIVED'::public.record_status,updated_at=now() where product_id=$1 and status='ACTIVE'::public.record_status`, [productId]);
    await tx.query(`insert into public.audit_events(actor_user_id,action,target_type,target_id,new_state,reason) values($1,'PRODUCT_ARCHIVED','PRODUCT',$2,$3::jsonb,'Phase 3 catalog master data archive')`, [actorUserId,productId,JSON.stringify({status:'ARCHIVED',variantsArchived:true})]);
    await tx.query(`insert into public.outbox_events(event_type,aggregate_type,aggregate_id,actor_user_id,payload) values('PRODUCT_ARCHIVED','PRODUCT',$1,$2,$3::jsonb)`, [productId,actorUserId,JSON.stringify({productId,status:'ARCHIVED',variantsArchived:true})]);
    return { id:productId, status:'ARCHIVED' as const };
  }

  async createVariant(tx: DatabaseTransaction, actorUserId: string, input: {
    productId: string; sku: string; ram?: string; storage?: string; color?: string; network?: string; display?: string;
    battery?: string; camera?: string; processor?: string; operatingSystem?: string; warrantyText?: string; otherSpecs?: Record<string, unknown>;
  }) {
    const context = await loadAuthorizationContext(tx, actorUserId);
    requirePermission(context, 'products.create');
    const product = await tx.query<{ id: string }>(`select p.id from public.products p join public.brands b on b.id=p.brand_id where p.id=$1 and b.organization_id=(select organization_id from public.profiles where user_id=$2) and p.status='ACTIVE'`, [input.productId,actorUserId]);
    if (product.length !== 1) throw new ValidationError('Product is not active in the actor organization.');
    const sku = input.sku.trim().toUpperCase();
    if (!sku) throw new ValidationError('SKU is required.');
    const existing = await tx.query(`select 1 from public.product_variants where upper(sku)=upper($1) limit 1`, [sku]);
    if (existing.length) throw new ConflictError('SKU already exists.');
    const rows = await tx.query<{ id: string }>(`insert into public.product_variants(product_id,sku,ram,storage,color,network,display,battery,camera,processor,operating_system,warranty_text,other_specs) values($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13::jsonb) returning id`, [
      input.productId,sku,input.ram?.trim()||null,input.storage?.trim()||null,input.color?.trim()||null,input.network?.trim()||null,input.display?.trim()||null,input.battery?.trim()||null,input.camera?.trim()||null,input.processor?.trim()||null,input.operatingSystem?.trim()||null,input.warrantyText?.trim()||null,JSON.stringify(input.otherSpecs ?? {})
    ]);
    const id = rows[0]?.id;
    if (!id) throw new ValidationError('Variant could not be created.');
    await tx.query(`insert into public.audit_events(actor_user_id,action,target_type,target_id,new_state,reason) values($1,'PRODUCT_VARIANT_CREATED','PRODUCT_VARIANT',$2,$3::jsonb,'Phase 3 catalog master data')`, [actorUserId,id,JSON.stringify({productId:input.productId,sku})]);
    await tx.query(`insert into public.outbox_events(event_type,aggregate_type,aggregate_id,actor_user_id,payload) values('PRODUCT_VARIANT_CREATED','PRODUCT_VARIANT',$1,$2,$3::jsonb)`, [id,actorUserId,JSON.stringify({variantId:id,productId:input.productId,sku})]);
    return { id, sku };
  }


  async updateVariant(tx: DatabaseTransaction, actorUserId: string, variantId: string, input: {
    sku: string; ram?: string; storage?: string; color?: string; network?: string; display?: string; battery?: string; camera?: string; processor?: string; operatingSystem?: string; warrantyText?: string; otherSpecs?: Record<string, unknown>;
  }) {
    const context = await loadAuthorizationContext(tx, actorUserId);
    requirePermission(context, 'products.edit');
    const organizationId = await organizationIdForActor(tx, actorUserId);
    const variant = await tx.query<{ id:string; sku:string }>(`select pv.id,pv.sku from public.product_variants pv join public.products p on p.id=pv.product_id join public.brands b on b.id=p.brand_id where pv.id=$1 and b.organization_id=$2`, [variantId,organizationId]);
    if (variant.length !== 1) throw new ValidationError('Variant not found in the actor organization.');
    const sku = input.sku.trim().toUpperCase();
    if (!sku) throw new ValidationError('SKU is required.');
    if (sku !== variant[0]!.sku) {
      const inventory = await tx.query(`select 1 from public.imei_units where product_variant_id=$1 limit 1`, [variantId]);
      if (inventory.length) throw new ConflictError('SKU cannot be changed after physical IMEI inventory exists for this variant.');
    }
    const duplicate = await tx.query(`select 1 from public.product_variants where upper(sku)=upper($1) and id<>$2 limit 1`, [sku,variantId]);
    if (duplicate.length) throw new ConflictError('SKU already exists.');
    const rows = await tx.query<{ id:string; sku:string; status:string }>(`update public.product_variants set sku=$1,ram=$2,storage=$3,color=$4,network=$5,display=$6,battery=$7,camera=$8,processor=$9,operating_system=$10,warranty_text=$11,other_specs=$12::jsonb,updated_at=now() where id=$13 returning id,sku,status`, [sku,input.ram?.trim()||null,input.storage?.trim()||null,input.color?.trim()||null,input.network?.trim()||null,input.display?.trim()||null,input.battery?.trim()||null,input.camera?.trim()||null,input.processor?.trim()||null,input.operatingSystem?.trim()||null,input.warrantyText?.trim()||null,JSON.stringify(input.otherSpecs ?? {}),variantId]);
    await tx.query(`insert into public.audit_events(actor_user_id,action,target_type,target_id,new_state,reason) values($1,'PRODUCT_VARIANT_UPDATED','PRODUCT_VARIANT',$2,$3::jsonb,'Phase 3 catalog master data edit')`, [actorUserId,variantId,JSON.stringify({sku})]);
    await tx.query(`insert into public.outbox_events(event_type,aggregate_type,aggregate_id,actor_user_id,payload) values('PRODUCT_VARIANT_UPDATED','PRODUCT_VARIANT',$1,$2,$3::jsonb)`, [variantId,actorUserId,JSON.stringify({variantId,sku})]);
    return { id:rows[0]!.id, sku:rows[0]!.sku, status:rows[0]!.status };
  }

  async archiveVariant(tx: DatabaseTransaction, actorUserId: string, variantId: string) {
    const context = await loadAuthorizationContext(tx, actorUserId);
    requirePermission(context, 'products.archive');
    const organizationId = await organizationIdForActor(tx, actorUserId);
    const rows = await tx.query<{ id:string; status:string }>(`update public.product_variants pv set status='ARCHIVED'::public.record_status,updated_at=now() from public.products p join public.brands b on b.id=p.brand_id where pv.id=$1 and pv.product_id=p.id and b.organization_id=$2 and pv.status<>'ARCHIVED'::public.record_status returning pv.id,pv.status`, [variantId,organizationId]);
    if (rows.length !== 1) throw new ValidationError('Variant not found or already archived.');
    await tx.query(`insert into public.audit_events(actor_user_id,action,target_type,target_id,new_state,reason) values($1,'PRODUCT_VARIANT_ARCHIVED','PRODUCT_VARIANT',$2,$3::jsonb,'Phase 3 catalog master data archive')`, [actorUserId,variantId,JSON.stringify({status:'ARCHIVED'})]);
    await tx.query(`insert into public.outbox_events(event_type,aggregate_type,aggregate_id,actor_user_id,payload) values('PRODUCT_VARIANT_ARCHIVED','PRODUCT_VARIANT',$1,$2,$3::jsonb)`, [variantId,actorUserId,JSON.stringify({variantId,status:'ARCHIVED'})]);
    return { id:variantId, status:'ARCHIVED' as const };
  }

  async listPricePolicies(tx: DatabaseTransaction, actorUserId: string, productVariantId?: string) {
    const context = await loadAuthorizationContext(tx, actorUserId);
    requirePermission(context, 'prices.view');
    const organizationId = await organizationIdForActor(tx, actorUserId);
    return tx.query(`
      select pp.id,pp.product_variant_id as "productVariantId",pv.sku,p.model_name as "modelName",b.brand_name as "brandName",
             pp.purchase_price as "purchasePrice",pp.selling_price as "sellingPrice",pp.minimum_price as "minimumPrice",pp.discount_limit as "discountLimit",
             pp.effective_from as "effectiveFrom",pp.effective_to as "effectiveTo",pp.status,pp.created_by as "createdBy",cp.display_name as "createdByName",pp.approved_by as "approvedBy",
             pp.created_at as "createdAt"
      from public.price_policies pp join public.product_variants pv on pv.id=pp.product_variant_id
      join public.products p on p.id=pv.product_id join public.brands b on b.id=p.brand_id
      left join public.profiles cp on cp.user_id=pp.created_by
      where b.organization_id=$1 and ($2::uuid is null or pp.product_variant_id=$2)
      order by pp.effective_from desc limit 500`,[organizationId,productVariantId??null]);
  }

  async createPricePolicy(tx: DatabaseTransaction, actorUserId: string, input: { productVariantId:string; purchasePrice:number; sellingPrice:number; minimumPrice:number; discountLimit:number; effectiveFrom:string; effectiveTo?:string }) {
    const context=await loadAuthorizationContext(tx,actorUserId); requirePermission(context,'prices.manage');
    if(!context.roles.includes('CEO')) throw new AuthorizationError('Only the CEO may create or activate price policies.');
    if(!Number.isFinite(input.purchasePrice)||input.purchasePrice<0) throw new ValidationError('Purchase price must be non-negative.');
    if(!Number.isFinite(input.sellingPrice)||input.sellingPrice<=0) throw new ValidationError('Selling price must be positive.');
    if(!Number.isFinite(input.minimumPrice)||input.minimumPrice<0||input.minimumPrice>input.sellingPrice) throw new ValidationError('Minimum price must be between zero and selling price.');
    if(!Number.isFinite(input.discountLimit)||input.discountLimit<0||input.discountLimit>input.sellingPrice) throw new ValidationError('Discount limit is invalid.');
    const organizationId=await organizationIdForActor(tx,actorUserId);
    const variant=await tx.query(`select pv.id from public.product_variants pv join public.products p on p.id=pv.product_id join public.brands b on b.id=p.brand_id where pv.id=$1 and b.organization_id=$2 and pv.status='ACTIVE'`,[input.productVariantId,organizationId]);
    if(variant.length!==1) throw new ValidationError('Product variant is not active in the actor organization.');
    const rows=await tx.query<{id:string}>(`insert into public.price_policies(product_variant_id,purchase_price,selling_price,minimum_price,discount_limit,effective_from,effective_to,status,created_by,approved_by) values($1,$2,$3,$4,$5,$6,$7,'ACTIVE',$8,case when $9 then $8 else null end) returning id`,[input.productVariantId,input.purchasePrice,input.sellingPrice,input.minimumPrice,input.discountLimit,input.effectiveFrom,input.effectiveTo||null,actorUserId,context.roles.includes('CEO')]);
    if(rows.length!==1) throw new ValidationError('Price policy could not be created.');
    await tx.query(`insert into public.audit_events(actor_user_id,action,target_type,target_id,new_state,reason,request_id) values($1,'PRICE_POLICY_CREATED','PRICE_POLICY',$2,$3::jsonb,'Phase 4 pricing policy',current_setting('amaal.request_id',true))`,[actorUserId,rows[0]!.id,JSON.stringify(input)]);
    await tx.query(`insert into public.outbox_events(event_type,aggregate_type,aggregate_id,actor_user_id,payload) values('PRICE_POLICY_CREATED','PRICE_POLICY',$1,$2,$3::jsonb)`,[rows[0]!.id,actorUserId,JSON.stringify(input)]);
    return {id:rows[0]!.id};
  }

  async listWarehouses(tx: DatabaseTransaction, actorUserId: string) {
    const context = await loadAuthorizationContext(tx, actorUserId);
    requirePermission(context, 'inventory.view');
    const organizationId = await organizationIdForActor(tx, actorUserId);
    return tx.query(`
      select w.id,w.warehouse_code as "code",w.warehouse_name as "name",w.warehouse_type as "type",w.region_id as "regionId",r.region_name as "regionName"
      from public.warehouses w left join public.regions r on r.id=w.region_id
      where w.organization_id=$1 and w.status='ACTIVE'
        and (${context.roles.some((r) => ['CEO','ADMIN'].includes(r)) ? 'true' : '$2::uuid[] @> array[w.region_id]::uuid[]'})
      order by case when w.warehouse_type='MASTER' then 0 else 1 end,w.warehouse_name
    `, [organizationId, context.regionIds]);
  }

  async receiveImeis(tx: DatabaseTransaction, actorUserId: string, input: {
    warehouseId: string; purchaseReference?: string; conditionStatus?: 'NEW'|'GOOD'|'DAMAGED'|'QUARANTINED'|'WRITEOFF';
    units: Array<{ imei: string; imei2?: string; serialNumber?: string; productVariantId: string }>;
  }) {
    const context = await loadAuthorizationContext(tx, actorUserId);
    requirePermission(context, 'inventory.transfer');
    if (!input.units.length || input.units.length > MAX_IMEI_BATCH) throw new ValidationError(`IMEI receipt batch must contain 1-${MAX_IMEI_BATCH} units.`);
    const organizationId = await organizationIdForActor(tx, actorUserId);
    const warehouseRows = await tx.query<{ warehouse_type: string; region_id: string | null }>(`select warehouse_type,region_id from public.warehouses where id=$1 and organization_id=$2 and status='ACTIVE'`, [input.warehouseId,organizationId]);
    if (warehouseRows.length !== 1) throw new ValidationError('Receipt warehouse not found or inactive.');
    const warehouse = warehouseRows[0]!;
    if (warehouse.region_id && !(context.roles.includes('CEO') || context.roles.includes('ADMIN') || context.regionIds.includes(warehouse.region_id))) throw new AuthorizationError('Receipt warehouse is outside your region scope.');

    const seen = new Set<string>();
    for (const unit of input.units) {
      const imei = normalizeImei(unit.imei);
      if (seen.has(imei)) throw new ConflictError(`Duplicate IMEI ${imei} in receipt batch.`);
      seen.add(imei);
      if (unit.imei2) {
        const imei2 = normalizeImei(unit.imei2);
        if (imei2 === imei) throw new ValidationError('Primary and secondary IMEI must differ.');
      }
      const variant = await tx.query(`select pv.id from public.product_variants pv join public.products p on p.id=pv.product_id join public.brands b on b.id=p.brand_id where pv.id=$1 and b.organization_id=$2 and pv.status='ACTIVE'`, [unit.productVariantId,organizationId]);
      if (variant.length !== 1) throw new ValidationError(`Product variant for IMEI ${imei} is invalid for this organization.`);
      const duplicate = await tx.query(`select 1 from public.imei_units where imei=$1 or ($2 is not null and imei_2=$2) limit 1`, [imei,unit.imei2 ? normalizeImei(unit.imei2) : null]);
      if (duplicate.length) throw new ConflictError(`IMEI ${imei} already exists.`);
    }

    const finalState = warehouse.warehouse_type === 'MASTER' ? 'MASTER_WAREHOUSE' : 'REGIONAL_WAREHOUSE';
    const inserted: string[] = [];
    for (const unit of input.units) {
      const imei = normalizeImei(unit.imei);
      const imei2 = unit.imei2 ? normalizeImei(unit.imei2) : null;
      const rows = await tx.query<{id:string}>(`insert into public.imei_units(imei,imei_2,serial_number,product_variant_id,purchase_reference,received_at,state,current_warehouse_id,current_region_id,condition_status) values($1,$2,$3,$4,$5,now(),$6,$7,$8,$9) returning id`, [imei,imei2,unit.serialNumber?.trim()||null,unit.productVariantId,input.purchaseReference?.trim()||null,finalState,input.warehouseId,warehouse.region_id,input.conditionStatus ?? 'NEW']);
      const id = rows[0]?.id;
      if (!id) throw new ValidationError(`IMEI ${imei} could not be received.`);
      inserted.push(id);
      await tx.query(`insert into public.inventory_movements(imei_id,to_warehouse_id,reason,movement_type,requested_by,approved_by,accepted_by,requested_at,approved_at,accepted_at,condition_before,condition_after,notes) values($1,$2,$3,'RECEIPT',$4,$4,$4,now(),now(),now(),null,$5,$6)`, [id,input.warehouseId,'INITIAL_RECEIPT',actorUserId,input.conditionStatus ?? 'NEW',`Initial inventory receipt: ${input.purchaseReference ?? 'no purchase reference'}`]);
      await tx.query(`insert into public.outbox_events(event_type,aggregate_type,aggregate_id,region_id,actor_user_id,payload) values('INVENTORY_RECEIVED','IMEI',$1,$2,$3,$4::jsonb)`, [id,warehouse.region_id,actorUserId,JSON.stringify({imei_id:id,warehouse_id:input.warehouseId,state:finalState})]);
    }
    await tx.query(`insert into public.audit_events(actor_user_id,action,target_type,target_id,new_state,reason,request_id) values($1,'INVENTORY_RECEIPT_CREATED','WAREHOUSE',$2,$3::jsonb,'Phase 3 initial stock receipt',current_setting('amaal.request_id',true))`, [actorUserId,input.warehouseId,JSON.stringify({count:inserted.length,state:finalState,imeiIds:inserted})]);
    return { warehouseId: input.warehouseId, count: inserted.length, imeiIds: inserted, state: finalState };
  }
}
