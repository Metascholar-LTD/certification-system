-- Create new table that matches webhook data structure exactly
CREATE TABLE public.webhook_registrations (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    registration_id text NOT NULL UNIQUE, -- From your $registration->id
    webinar_id text NOT NULL, -- From your $webinar->id  
    webinar_title text NOT NULL, -- From your $webinar->title
    participant_name text NOT NULL, -- From your $registration->first_name . ' ' . $registration->surname
    participant_email text NOT NULL, -- From your $registration->email
    time_zone text NOT NULL, -- From your $registration->time_zone
    webinar_date timestamp with time zone, -- From your $webinar->scheduled_at
    webinar_link text, -- From your $webinar->link
    registration_type text DEFAULT 'free', -- 'free' or 'paid'
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now()
);

-- Create indexes for better performance
CREATE INDEX idx_webhook_registrations_registration_id ON public.webhook_registrations(registration_id);
CREATE INDEX idx_webhook_registrations_email ON public.webhook_registrations(participant_email);
CREATE INDEX idx_webhook_registrations_webinar_id ON public.webhook_registrations(webinar_id);

-- Add RLS (Row Level Security) policy if needed
ALTER TABLE public.webhook_registrations ENABLE ROW LEVEL SECURITY;

-- Create policy to allow public read access (for admin interface)
CREATE POLICY "Allow public read access" ON public.webhook_registrations
FOR SELECT USING (true);

-- Create policy to allow webhook function to insert/update
CREATE POLICY "Allow webhook insert/update" ON public.webhook_registrations
FOR ALL USING (true);

-- Create updated_at trigger
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER update_webhook_registrations_updated_at 
    BEFORE UPDATE ON public.webhook_registrations 
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();