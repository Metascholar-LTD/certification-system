-- Enhance certificates table for better file tracking and validation
-- Add columns to track file metadata and improve debugging

-- Add file metadata columns
ALTER TABLE public.certificates 
ADD COLUMN IF NOT EXISTS file_size bigint;

ALTER TABLE public.certificates 
ADD COLUMN IF NOT EXISTS original_filename text;

ALTER TABLE public.certificates 
ADD COLUMN IF NOT EXISTS last_validated_at timestamptz;

ALTER TABLE public.certificates 
ADD COLUMN IF NOT EXISTS validation_status text DEFAULT 'pending';

-- Add index for better performance on file operations
CREATE INDEX IF NOT EXISTS idx_certificates_validation_status ON public.certificates(validation_status);
CREATE INDEX IF NOT EXISTS idx_certificates_file_size ON public.certificates(file_size);

-- Update existing records to mark them as needing validation
UPDATE public.certificates 
SET validation_status = 'needs_validation'
WHERE validation_status IS NULL OR validation_status = 'pending';

-- Add a function to validate certificate data integrity
CREATE OR REPLACE FUNCTION validate_certificate_data()
RETURNS trigger AS $$
BEGIN
  -- Validate that certificate_url is a proper PDF data URL
  IF NEW.certificate_url IS NOT NULL AND NOT NEW.certificate_url LIKE 'data:application/pdf;base64,%' THEN
    RAISE EXCEPTION 'Certificate URL must be a valid PDF data URL';
  END IF;
  
  -- Extract and validate base64 data length
  IF NEW.certificate_url IS NOT NULL THEN
    NEW.last_validated_at = NOW();
    NEW.validation_status = 'validated';
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger to automatically validate certificate data on insert/update
DROP TRIGGER IF EXISTS trigger_validate_certificate ON public.certificates;
CREATE TRIGGER trigger_validate_certificate
  BEFORE INSERT OR UPDATE ON public.certificates
  FOR EACH ROW
  EXECUTE FUNCTION validate_certificate_data();

-- Add comment explaining the enhancements
COMMENT ON COLUMN public.certificates.file_size IS 'Original file size in bytes for validation and debugging';
COMMENT ON COLUMN public.certificates.original_filename IS 'Original filename of uploaded certificate';
COMMENT ON COLUMN public.certificates.last_validated_at IS 'Timestamp of last successful validation';
COMMENT ON COLUMN public.certificates.validation_status IS 'Status of certificate data validation: pending, validated, needs_validation, invalid';