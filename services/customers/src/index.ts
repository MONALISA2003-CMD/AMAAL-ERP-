import { randomUUID } from 'node:crypto';
import type { DatabaseTransaction } from '@amaal/database';
import { authorize, loadAuthorizationContext } from '@amaal/permissions';
import { AuthorizationError, ConflictError, ValidationError } from '@amaal/shared';

export type CustomerCreateInput = {
  fullName: string;
  phone: string;
  alternativePhone?: string;
  email?: string;
  address?: string;
  customerType?: string;
  identityReference?: string;
  consentStatus?: string;
};

export type CustomerUpdateInput = Partial<CustomerCreateInput>;

function requirePermission(context: Awaited<ReturnType<typeof loadAuthorizationContext>>, permission: string): void {
  const decision = authorize(context, permission);
  if (!decision.allowed) throw new AuthorizationError(decision.reason);
}

async function organizationId(tx: DatabaseTransaction, userId: string): Promise<string> {
  const rows = await tx.query<{ organization_id: string }>(`select organization_id from public.profiles where user_id=$1 and status='ACTIVE'`, [userId]);
  if (rows.length !== 1) throw new AuthorizationError('Actor is not linked to an active Amaal organization.');
  return rows[0]!.organization_id;
}

export class PostgresCustomerService {
  async list(tx: DatabaseTransaction, actorUserId: string, query = '', limit = 100) {
    const context = await loadAuthorizationContext(tx, actorUserId);
    requirePermission(context, 'customers.view');
    const orgId = await organizationId(tx, actorUserId);
    const q = query.trim().toLowerCase();
    const safeLimit = Math.min(Math.max(limit, 1), 200);
    return tx.query(`
      select c.id,c.customer_number as "customerNumber",c.full_name as "fullName",c.phone,c.alternative_phone as "alternativePhone",
             c.email,c.address,c.customer_type as "customerType",c.identity_reference as "identityReference",c.consent_status as "consentStatus",
             c.owner_user_id as "ownerUserId",op.display_name as "ownerName",c.region_id as "regionId",r.region_name as "regionName",
             c.subregion_id as "subregionId",sr.name as "subregionName",c.team_id as "teamId",t.team_name as "teamName",c.shop_id as "shopId",s.shop_name as "shopName",
             c.created_at as "createdAt",c.updated_at as "updatedAt"
      from public.customers c
      left join public.profiles op on op.user_id=c.owner_user_id
      left join public.regions r on r.id=c.region_id
      left join public.subregions sr on sr.id=c.subregion_id
      left join public.teams t on t.id=c.team_id
      left join public.shops s on s.id=c.shop_id
      where c.organization_id=$1 and c.status='ACTIVE' and private.user_can_access_customer(c.id)
        and ($2='' or lower(c.customer_number||' '||c.full_name||' '||c.phone||' '||coalesce(c.email,'')) like '%'||$2||'%')
      order by c.updated_at desc,c.full_name asc
      limit $3
    `, [orgId,q,safeLimit]);
  }

  async get(tx: DatabaseTransaction, actorUserId: string, customerId: string) {
    const context = await loadAuthorizationContext(tx, actorUserId);
    requirePermission(context, 'customers.view');
    const rows = await tx.query(`
      select c.id,c.customer_number as "customerNumber",c.full_name as "fullName",c.phone,c.alternative_phone as "alternativePhone",
             c.email,c.address,c.customer_type as "customerType",c.identity_reference as "identityReference",c.consent_status as "consentStatus",
             c.owner_user_id as "ownerUserId",op.display_name as "ownerName",c.region_id as "regionId",r.region_name as "regionName",
             c.subregion_id as "subregionId",sr.name as "subregionName",c.team_id as "teamId",t.team_name as "teamName",c.shop_id as "shopId",s.shop_name as "shopName",
             c.created_at as "createdAt",c.updated_at as "updatedAt"
      from public.customers c
      left join public.profiles op on op.user_id=c.owner_user_id
      left join public.regions r on r.id=c.region_id
      left join public.subregions sr on sr.id=c.subregion_id
      left join public.teams t on t.id=c.team_id
      left join public.shops s on s.id=c.shop_id
      where c.id=$1 and private.user_can_access_customer(c.id)
    `, [customerId]);
    if (rows.length !== 1) throw new ValidationError('Customer not found or outside your organizational scope.');
    return rows[0];
  }

  async create(tx: DatabaseTransaction, actorUserId: string, input: CustomerCreateInput) {
    const context = await loadAuthorizationContext(tx, actorUserId);
    requirePermission(context, 'customers.create');
    const orgId = await organizationId(tx, actorUserId);
    if (!input.fullName.trim()) throw new ValidationError('Customer full name is required.');
    if (!input.phone.trim()) throw new ValidationError('Customer phone is required.');
    if (input.consentStatus && !['PENDING','GIVEN','DECLINED'].includes(input.consentStatus)) throw new ValidationError('Unsupported consent status.');
    const duplicate = await tx.query(`select 1 from public.customers where organization_id=$1 and status='ACTIVE' and phone=$2 limit 1`, [orgId,input.phone.trim()]);
    if (duplicate.length) throw new ConflictError('An active customer with this phone number already exists.');

    const customerNumber = `CUS-${new Date().toISOString().slice(0,10).replaceAll('-','')}-${randomUUID().slice(0,8).toUpperCase()}`;

    const rows = await tx.query<{ id: string }>(`
      insert into public.customers(organization_id,customer_number,full_name,phone,alternative_phone,email,address,customer_type,identity_reference,consent_status,consent_captured_at,created_by,owner_user_id)
      values($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,case when $10='GIVEN' then now() else null end,$11,$11) returning id
    `,[orgId,customerNumber,input.fullName.trim(),input.phone.trim(),input.alternativePhone?.trim()||null,input.email?.trim()||null,input.address?.trim()||null,input.customerType?.trim()||null,input.identityReference?.trim()||null,input.consentStatus?.trim()||'PENDING',actorUserId]);
    const id = rows[0]?.id;
    if (!id) throw new ValidationError('Customer could not be created.');
    await tx.query(`insert into public.customer_assignments(customer_id,previous_owner_user_id,new_owner_user_id,previous_region_id,new_region_id,previous_subregion_id,new_subregion_id,previous_team_id,new_team_id,previous_shop_id,new_shop_id,reason,assignment_reason,changed_by) select id,null,owner_user_id,null,region_id,null,subregion_id,null,team_id,null,shop_id,'INITIAL_ASSIGNMENT','INITIAL_ASSIGNMENT',$1 from public.customers where id=$2`,[actorUserId,id]);
    await tx.query(`insert into public.audit_events(actor_user_id,action,target_type,target_id,new_state,reason,request_id) values($1,'CUSTOMER_CREATED','CUSTOMER',$2,$3::jsonb,'Phase 4 customer creation',current_setting('amaal.request_id',true))`,[actorUserId,id,JSON.stringify({customer_number:customerNumber,owner_user_id:actorUserId})]);
    await tx.query(`insert into public.outbox_events(event_type,aggregate_type,aggregate_id,actor_user_id,payload) values('CUSTOMER_CREATED','CUSTOMER',$1,$2,$3::jsonb)`,[id,actorUserId,JSON.stringify({customer_id:id,customer_number:customerNumber,owner_user_id:actorUserId})]);
    return { id, customerNumber };
  }


  async assign(tx: DatabaseTransaction, actorUserId: string, customerId: string, newOwnerUserId: string, reason: string) {
    const context = await loadAuthorizationContext(tx, actorUserId);
    requirePermission(context, 'customers.assign');
    if (!reason.trim()) throw new ValidationError('Assignment reason is required.');
    const orgId = await organizationId(tx, actorUserId);
    const customerRows = await tx.query<{id:string; owner_user_id:string; region_id:string|null; subregion_id:string|null; team_id:string|null; shop_id:string|null}>(`select id,owner_user_id,region_id,subregion_id,team_id,shop_id from public.customers where id=$1 and organization_id=$2 and status='ACTIVE' for update`,[customerId,orgId]);
    if (customerRows.length !== 1) throw new ValidationError('Customer not found or inactive.');
    const target = await tx.query<{user_id:string; region_id:string|null; subregion_id:string|null; team_id:string|null; shop_id:string|null}>(`
      select p.user_id, coalesce(tm.region_id,m.region_id,ra.region_id) as region_id,
             coalesce(tm.subregion_id,m.subregion_id) as subregion_id,
             coalesce(tm.team_id,ra.team_id) as team_id, coalesce(tm.shop_id,ra.shop_id) as shop_id
      from public.profiles p
      left join lateral (
        select t.region_id,t.subregion_id,tm.team_id,tm.shop_id
        from public.team_memberships tm join public.teams t on t.id=tm.team_id
        where tm.user_id=p.user_id and tm.status='ACTIVE' and (tm.effective_to is null or tm.effective_to>now())
        order by case when tm.role='SHOP_OWNER' then 0 else 1 end,tm.effective_from desc limit 1
      ) tm on true
      left join lateral (select m.region_id,m.subregion_id from public.managers m where m.user_id=p.user_id and m.status='ACTIVE' order by m.created_at desc limit 1) m on true
      left join lateral (
        select ra.region_id,ra.team_id,ra.shop_id from public.role_assignments ra
        where ra.user_id=p.user_id and ra.status='ACTIVE' and (ra.effective_to is null or ra.effective_to>now())
        order by case when ra.team_id is not null then 0 when ra.region_id is not null then 1 else 2 end limit 1
      ) ra on true
      where p.user_id=$1 and p.organization_id=$2 and p.status='ACTIVE'
    `,[newOwnerUserId,orgId]);
    if (target.length !== 1) throw new ValidationError('New customer owner is not an active user in this organization.');
    if (target[0]!.region_id && !context.roles.includes('CEO') && !context.roles.includes('ADMIN') && !context.regionIds.includes(target[0]!.region_id)) throw new AuthorizationError('New customer owner is outside your organizational scope.');
    const current=customerRows[0]!; const t=target[0]!;
    await tx.query(`update public.customers set owner_user_id=$1,region_id=$2,subregion_id=$3,team_id=$4,shop_id=$5,updated_at=now() where id=$6`,[newOwnerUserId,t.region_id,t.subregion_id,t.team_id,t.shop_id,customerId]);
    await tx.query(`insert into public.customer_assignments(customer_id,previous_owner_user_id,new_owner_user_id,previous_region_id,new_region_id,previous_subregion_id,new_subregion_id,previous_team_id,new_team_id,previous_shop_id,new_shop_id,reason,assignment_reason,changed_by) values($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$12,$13)`,[customerId,current.owner_user_id,newOwnerUserId,current.region_id,t.region_id,current.subregion_id,t.subregion_id,current.team_id,t.team_id,current.shop_id,t.shop_id,reason.trim(),actorUserId]);
    await tx.query(`insert into public.audit_events(actor_user_id,action,target_type,target_id,new_state,reason,request_id) values($1,'CUSTOMER_REASSIGNED','CUSTOMER',$2,$3::jsonb,$4,current_setting('amaal.request_id',true))`,[actorUserId,customerId,JSON.stringify({new_owner_user_id:newOwnerUserId,region_id:t.region_id,team_id:t.team_id,shop_id:t.shop_id}),reason.trim()]);
    await tx.query(`insert into public.outbox_events(event_type,aggregate_type,aggregate_id,actor_user_id,payload) values('CUSTOMER_REASSIGNED','CUSTOMER',$1,$2,$3::jsonb)`,[customerId,actorUserId,JSON.stringify({customer_id:customerId,new_owner_user_id:newOwnerUserId,reason:reason.trim()})]);
    return { id: customerId, ownerUserId: newOwnerUserId, regionId:t.region_id, subregionId:t.subregion_id, teamId:t.team_id, shopId:t.shop_id };
  }

  async update(tx: DatabaseTransaction, actorUserId: string, customerId: string, input: CustomerUpdateInput) {
    const context = await loadAuthorizationContext(tx, actorUserId);
    const existing = await tx.query<{ id:string; owner_user_id:string; region_id:string|null; team_id:string|null; shop_id:string|null }>(
      `select id,owner_user_id,region_id,team_id,shop_id from public.customers where id=$1 and private.user_can_access_customer(id) for update`,
      [customerId],
    );
    if(existing.length!==1) throw new ValidationError('Customer not found or outside your organizational scope.');
    requirePermission(context,'customers.edit');
    const sets: string[]=[]; const values: unknown[]=[];
    const push=(column:string,value:unknown)=>{values.push(value);sets.push(`${column}=$${values.length}`);};
    if(input.fullName!==undefined){ if(!input.fullName.trim()) throw new ValidationError('Customer full name is required.'); push('full_name',input.fullName.trim()); }
    if(input.phone!==undefined){ if(!input.phone.trim()) throw new ValidationError('Customer phone is required.'); push('phone',input.phone.trim()); }
    if(input.alternativePhone!==undefined) push('alternative_phone',input.alternativePhone.trim()||null);
    if(input.email!==undefined) push('email',input.email.trim()||null);
    if(input.address!==undefined) push('address',input.address.trim()||null);
    if(input.customerType!==undefined) push('customer_type',input.customerType.trim()||null);
    if(input.identityReference!==undefined) push('identity_reference',input.identityReference.trim()||null);
    if(input.consentStatus!==undefined){ if(!['PENDING','GIVEN','DECLINED'].includes(input.consentStatus)) throw new ValidationError('Unsupported consent status.'); push('consent_status',input.consentStatus); if(input.consentStatus==='GIVEN') sets.push('consent_captured_at=coalesce(consent_captured_at,now())'); }
    if(!sets.length) throw new ValidationError('No customer fields were provided.');
    values.push(customerId);
    const rows = await tx.query<{id:string}>(`update public.customers set ${sets.join(',')},updated_at=now() where id=$${values.length} returning id`,values);
    if(rows.length!==1) throw new ValidationError('Customer could not be updated.');
    await tx.query(`insert into public.audit_events(actor_user_id,action,target_type,target_id,new_state,reason,request_id) values($1,'CUSTOMER_UPDATED','CUSTOMER',$2,$3::jsonb,'Phase 4 customer maintenance',current_setting('amaal.request_id',true))`,[actorUserId,customerId,JSON.stringify(input)]);
    await tx.query(`insert into public.outbox_events(event_type,aggregate_type,aggregate_id,actor_user_id,payload) values('CUSTOMER_UPDATED','CUSTOMER',$1,$2,$3::jsonb)`,[customerId,actorUserId,JSON.stringify({customer_id:customerId,changes:input})]);
    return this.get(tx,actorUserId,customerId);
  }

}
