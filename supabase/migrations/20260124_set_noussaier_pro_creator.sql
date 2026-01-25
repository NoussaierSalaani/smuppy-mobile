-- Set noussaier.salaani@smuppy.com as pro_creator
UPDATE profiles
SET account_type = 'pro_creator'
WHERE id = (
  SELECT id FROM auth.users
  WHERE email = 'noussaier.salaani@smuppy.com'
);
