-- Live equivalent: 20260928163512 / rls_hardening.
revoke all on schema private from anon;
grant usage on schema private to authenticated;
grant execute on function private.user_has_role(public.role_key) to authenticated;
grant execute on function private.user_has_permission(text) to authenticated;
grant execute on function private.user_can_access_region(uuid) to authenticated;
grant execute on function private.user_can_access_team(uuid) to authenticated;
grant execute on function private.user_can_access_user(uuid) to authenticated;
grant execute on function private.user_can_access_imei(uuid) to authenticated;
grant execute on function private.user_can_access_customer(uuid) to authenticated;
grant execute on function private.user_can_access_sale(uuid) to authenticated;
