-- Update certificates table to work with webhook_registrations
-- Add foreign key to webhook_registrations instead of webinar_registrations

-- First, drop the existing foreign key constraint
ALTER TABLE public.certificates 
DROP CONSTRAINT IF EXISTS certificates_registration_id_fkey;

-- Add new foreign key to webhook_registrations
ALTER TABLE public.certificates 
ADD CONSTRAINT certificates_webhook_registration_fkey 
FOREIGN KEY (registration_id) REFERENCES public.webhook_registrations(id) ON DELETE CASCADE;

-- Add certificate number for uniqueness
ALTER TABLE public.certificates 
ADD COLUMN IF NOT EXISTS certificate_number text UNIQUE;

-- Add participant name for easy access
ALTER TABLE public.certificates 
ADD COLUMN IF NOT EXISTS participant_name text;

-- Add participant email for easy access  
ALTER TABLE public.certificates 
ADD COLUMN IF NOT EXISTS participant_email text;

-- Create index for better performance
CREATE INDEX IF NOT EXISTS idx_certificates_webhook_registration ON public.certificates(registration_id);
CREATE INDEX IF NOT EXISTS idx_certificates_certificate_number ON public.certificates(certificate_number);

-- Update RLS policies for certificates table
DROP POLICY IF EXISTS "Allow public read access" ON public.certificates;
CREATE POLICY "Allow public read access" ON public.certificates
FOR SELECT USING (true);

DROP POLICY IF EXISTS "Allow admin full access" ON public.certificates;
CREATE POLICY "Allow admin full access" ON public.certificates
FOR ALL USING (true);