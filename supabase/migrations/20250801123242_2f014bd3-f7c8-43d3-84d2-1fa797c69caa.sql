-- Add missing columns to webinar_registrations table for the new webhook data
ALTER TABLE public.webinar_registrations 
ADD COLUMN IF NOT EXISTS registration_type text DEFAULT 'free',
ADD COLUMN IF NOT EXISTS external_registration_id text;