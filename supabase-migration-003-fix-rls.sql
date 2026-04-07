-- ============================================================================
-- Migration 003: Fix infinite recursion in RLS policies
-- The admin-check policies on philosophy_modules, exercise_library, etc.
-- subquery profiles, which has its own admin policy that subqueries profiles
-- again, causing infinite recursion (error 42P17).
--
-- Fix: Create a SECURITY DEFINER function that bypasses RLS to check admin.
-- ============================================================================

-- Step 1: Create a function that checks admin role without triggering RLS
CREATE OR REPLACE FUNCTION is_admin()
RETURNS boolean AS $$
  SELECT EXISTS (
    SELECT 1 FROM profiles
    WHERE id = auth.uid() AND role = 'admin'
  );
$$ LANGUAGE sql SECURITY DEFINER STABLE;


-- Step 2: Drop and recreate the recursive policies on profiles
DROP POLICY IF EXISTS "Admins can read all profiles" ON profiles;
CREATE POLICY "Admins can read all profiles"
  ON profiles FOR SELECT USING (
    auth.uid() = id OR is_admin()
  );

DROP POLICY IF EXISTS "Admins can update all profiles" ON profiles;
CREATE POLICY "Admins can update all profiles"
  ON profiles FOR UPDATE USING (
    auth.uid() = id OR is_admin()
  );


-- Step 3: Fix philosophy_modules policies
DROP POLICY IF EXISTS "Admins can insert philosophy_modules" ON philosophy_modules;
CREATE POLICY "Admins can insert philosophy_modules"
  ON philosophy_modules FOR INSERT WITH CHECK (is_admin());

DROP POLICY IF EXISTS "Admins can update philosophy_modules" ON philosophy_modules;
CREATE POLICY "Admins can update philosophy_modules"
  ON philosophy_modules FOR UPDATE USING (is_admin());

DROP POLICY IF EXISTS "Admins can delete philosophy_modules" ON philosophy_modules;
CREATE POLICY "Admins can delete philosophy_modules"
  ON philosophy_modules FOR DELETE USING (is_admin());


-- Step 4: Fix exercise_library policies
DROP POLICY IF EXISTS "Admins can insert exercise_library" ON exercise_library;
CREATE POLICY "Admins can insert exercise_library"
  ON exercise_library FOR INSERT WITH CHECK (is_admin());

DROP POLICY IF EXISTS "Admins can update exercise_library" ON exercise_library;
CREATE POLICY "Admins can update exercise_library"
  ON exercise_library FOR UPDATE USING (is_admin());

DROP POLICY IF EXISTS "Admins can delete exercise_library" ON exercise_library;
CREATE POLICY "Admins can delete exercise_library"
  ON exercise_library FOR DELETE USING (is_admin());


-- Step 5: Fix philosophy_gaps policies
DROP POLICY IF EXISTS "Admins can read gaps" ON philosophy_gaps;
CREATE POLICY "Admins can read gaps"
  ON philosophy_gaps FOR SELECT USING (is_admin());

DROP POLICY IF EXISTS "Admins can update gaps" ON philosophy_gaps;
CREATE POLICY "Admins can update gaps"
  ON philosophy_gaps FOR UPDATE USING (is_admin());


-- Step 6: Fix module_version_history policies
DROP POLICY IF EXISTS "Admins can read version history" ON module_version_history;
CREATE POLICY "Admins can read version history"
  ON module_version_history FOR SELECT USING (is_admin());

DROP POLICY IF EXISTS "Admins can insert version history" ON module_version_history;
CREATE POLICY "Admins can insert version history"
  ON module_version_history FOR INSERT WITH CHECK (is_admin());


-- ============================================================================
-- Done! All admin-check policies now use is_admin() which bypasses RLS.
-- Retry seedReferenceData() in the browser console.
-- ============================================================================
