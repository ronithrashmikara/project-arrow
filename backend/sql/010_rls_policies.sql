-- =========================================================
-- Project Arrow
-- Local PostgreSQL Row Level Security Policies
-- =========================================================

-- ---------------------------------------------------------
-- 1. Enable RLS
-- ---------------------------------------------------------

ALTER TABLE user_roles
ENABLE ROW LEVEL SECURITY;

ALTER TABLE hotels
ENABLE ROW LEVEL SECURITY;

ALTER TABLE emission_factors
ENABLE ROW LEVEL SECURITY;


-- ---------------------------------------------------------
-- 2. Current application user helper
-- ---------------------------------------------------------

CREATE OR REPLACE FUNCTION public.current_app_user_id()
RETURNS UUID
LANGUAGE SQL
STABLE
AS $$
    SELECT NULLIF(
        current_setting(
            'app.current_user_id',
            true
        ),
        ''
    )::uuid;
$$;


-- ---------------------------------------------------------
-- 3. Admin helper
-- ---------------------------------------------------------

CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS BOOLEAN
LANGUAGE SQL
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT EXISTS (
        SELECT 1
        FROM public.user_roles
        WHERE user_id =
            public.current_app_user_id()
          AND role = 'ADMIN'
          AND is_active = TRUE
    );
$$;


-- =========================================================
-- USER ROLES POLICIES
-- =========================================================

DROP POLICY IF EXISTS
"Users can view own role"
ON user_roles;

DROP POLICY IF EXISTS
"Admins can view all user roles"
ON user_roles;


CREATE POLICY
"Users can view own role"
ON user_roles
FOR SELECT
USING (
    user_id =
        public.current_app_user_id()
);


CREATE POLICY
"Admins can view all user roles"
ON user_roles
FOR SELECT
USING (
    public.is_admin()
);


-- =========================================================
-- HOTEL POLICIES
-- =========================================================

DROP POLICY IF EXISTS
"Admins can view hotels"
ON hotels;

DROP POLICY IF EXISTS
"Admins can update hotels"
ON hotels;


CREATE POLICY
"Admins can view hotels"
ON hotels
FOR SELECT
USING (
    public.is_admin()
);


CREATE POLICY
"Admins can update hotels"
ON hotels
FOR UPDATE
USING (
    public.is_admin()
)
WITH CHECK (
    public.is_admin()
);


-- =========================================================
-- EMISSION FACTOR POLICIES
-- =========================================================

DROP POLICY IF EXISTS
"Users can view approved factors"
ON emission_factors;

DROP POLICY IF EXISTS
"Admins can view all factors"
ON emission_factors;

DROP POLICY IF EXISTS
"Admins can create factors"
ON emission_factors;

DROP POLICY IF EXISTS
"Admins can update factors"
ON emission_factors;


CREATE POLICY
"Users can view approved factors"
ON emission_factors
FOR SELECT
USING (
    status = 'APPROVED'
);


CREATE POLICY
"Admins can view all factors"
ON emission_factors
FOR SELECT
USING (
    public.is_admin()
);


CREATE POLICY
"Admins can create factors"
ON emission_factors
FOR INSERT
WITH CHECK (
    public.is_admin()
);


CREATE POLICY
"Admins can update factors"
ON emission_factors
FOR UPDATE
USING (
    public.is_admin()
)
WITH CHECK (
    public.is_admin()
);


-- =========================================================
-- TEST / VERIFICATION QUERIES
-- =========================================================

SELECT set_config(
    'app.current_user_id',
    '11111111-1111-1111-1111-111111111111',
    false
);

SELECT public.current_app_user_id();

SELECT public.is_admin();

SELECT
    tablename,
    policyname,
    cmd
FROM pg_policies
WHERE tablename IN (
    'user_roles',
    'hotels',
    'emission_factors'
)
ORDER BY
    tablename,
    policyname;