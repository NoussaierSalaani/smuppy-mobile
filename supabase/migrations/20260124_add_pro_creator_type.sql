-- Drop the old constraint and add a new one that includes pro_creator
ALTER TABLE profiles DROP CONSTRAINT IF EXISTS profiles_account_type_check;

-- Add new constraint with all account types
ALTER TABLE profiles ADD CONSTRAINT profiles_account_type_check
CHECK (account_type IN ('personal', 'pro_creator', 'pro_business', 'pro_local'));

-- Now update the accounts to pro_creator
UPDATE profiles
SET account_type = 'pro_creator'
WHERE username IN (
  'CoachMarcus',
  'YogiPriya',
  'NutritionistAnna',
  'HIITJason',
  'FighterDiego',
  'MindCoachElena',
  'CoachThompson',
  'PhysioClaire',
  'DancerMaya',
  'AdventureAlex',
  'SpecialistRuth',
  'FunctionalMike',
  'RecoverySam',
  'PerformanceKai',
  'OnlineSarah',
  'LifestyleJordan',
  'CombatFitRico',
  'AquaMarina',
  'FlexLuna',
  'CorporateBen',
  'HolisticAria',
  'TaiChiWei',
  'WeightLossNina',
  'ExtremeZack'
);
