-- Migration 017: Add business coordinates to profiles
-- Allows pro_business accounts to store lat/lon for map marker display

ALTER TABLE profiles ADD COLUMN IF NOT EXISTS business_latitude DECIMAL(10, 8);
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS business_longitude DECIMAL(11, 8);
