-- Add certificate_type column to certificates table
ALTER TABLE public.certificates 
ADD COLUMN IF NOT EXISTS certificate_type text DEFAULT 'image';

-- Update existing records to have proper type
UPDATE public.certificates 
SET certificate_type = CASE 
  WHEN certificate_url LIKE 'data:application/pdf%' THEN 'pdf'
  ELSE 'image'
END
WHERE certificate_type IS NULL OR certificate_type = 'image';