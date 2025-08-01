-- Add RLS policies for webhook_registrations table

-- Create policy to allow public read access (for admin interface)
CREATE POLICY "Allow public read access" ON public.webhook_registrations
FOR SELECT USING (true);

-- Create policy to allow webhook function to insert/update
CREATE POLICY "Allow webhook insert/update" ON public.webhook_registrations
FOR ALL USING (true);