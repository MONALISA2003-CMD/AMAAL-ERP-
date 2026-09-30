-- Amaal RLS authorization test checklist.
-- Execute with Supabase's database test harness using representative authenticated identities.
-- These are intended as deny/allow cases, not production data.

-- Required negative cases:
-- 1. Agent cannot read another Agent's IMEI stock.
-- 2. Agent cannot read another Agent's customers or sales.
-- 3. Shop Owner cannot read another Shop Owner's customers or sales.
-- 4. Team Leader cannot read another Team's stock.
-- 5. Manager cannot read another Manager's team stock.
-- 6. Regional Manager cannot read another Region's warehouse stock.
-- 7. Recovery Officer cannot update sales or payments directly.
-- 8. Authenticated users cannot directly insert audit/outbox events.
-- 9. Jarvis tool queries cannot expand beyond the caller's current scope.
-- 10. CEO/Admin can read company-wide governed data.

-- Concrete assertions will be wired once the test harness has seeded representative
-- auth identities and the domain service transaction functions exist.
