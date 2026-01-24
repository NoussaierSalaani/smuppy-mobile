-- Update accounts to pro_creator type
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
