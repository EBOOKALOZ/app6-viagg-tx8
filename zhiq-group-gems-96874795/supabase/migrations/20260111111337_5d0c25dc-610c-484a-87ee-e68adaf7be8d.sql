-- Create media library table
CREATE TABLE public.media_library (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  title TEXT NOT NULL,
  description TEXT,
  media_type TEXT NOT NULL CHECK (media_type IN ('image', 'video')),
  media_url TEXT NOT NULL,
  tags TEXT[] NOT NULL DEFAULT '{}',
  status TEXT NOT NULL DEFAULT 'ativo' CHECK (status IN ('ativo', 'pausado')),
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create group posting settings table
CREATE TABLE public.group_posting_settings (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  group_id UUID NOT NULL,
  group_type TEXT NOT NULL CHECK (group_type IN ('driver', 'motoboy')),
  posting_interval_days INTEGER NOT NULL DEFAULT 6,
  last_posted_at TIMESTAMP WITH TIME ZONE,
  next_allowed_at TIMESTAMP WITH TIME ZONE,
  last_media_id UUID REFERENCES public.media_library(id),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(group_id, group_type)
);

-- Create posting history table
CREATE TABLE public.posting_history (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  group_id UUID NOT NULL,
  group_type TEXT NOT NULL CHECK (group_type IN ('driver', 'motoboy')),
  media_id UUID REFERENCES public.media_library(id),
  message TEXT,
  status TEXT NOT NULL DEFAULT 'postado' CHECK (status IN ('postado', 'erro', 'bloqueado')),
  error_message TEXT,
  posted_by UUID REFERENCES auth.users(id),
  posted_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create posting messages table
CREATE TABLE public.posting_messages (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  title TEXT NOT NULL,
  content TEXT NOT NULL,
  tags TEXT[] NOT NULL DEFAULT '{}',
  status TEXT NOT NULL DEFAULT 'ativo' CHECK (status IN ('ativo', 'pausado')),
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.media_library ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.group_posting_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.posting_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.posting_messages ENABLE ROW LEVEL SECURITY;

-- RLS policies for media_library
CREATE POLICY "Admins can manage all media"
ON public.media_library
FOR ALL
USING (has_role(auth.uid(), 'admin'::app_role));

-- RLS policies for group_posting_settings
CREATE POLICY "Admins can manage all posting settings"
ON public.group_posting_settings
FOR ALL
USING (has_role(auth.uid(), 'admin'::app_role));

-- RLS policies for posting_history
CREATE POLICY "Admins can manage all posting history"
ON public.posting_history
FOR ALL
USING (has_role(auth.uid(), 'admin'::app_role));

-- RLS policies for posting_messages
CREATE POLICY "Admins can manage all posting messages"
ON public.posting_messages
FOR ALL
USING (has_role(auth.uid(), 'admin'::app_role));

-- Create storage bucket for posting media
INSERT INTO storage.buckets (id, name, public) VALUES ('posting-media', 'posting-media', true);

-- Storage policies
CREATE POLICY "Admins can upload posting media"
ON storage.objects
FOR INSERT
WITH CHECK (bucket_id = 'posting-media' AND has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admins can update posting media"
ON storage.objects
FOR UPDATE
USING (bucket_id = 'posting-media' AND has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admins can delete posting media"
ON storage.objects
FOR DELETE
USING (bucket_id = 'posting-media' AND has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Anyone can view posting media"
ON storage.objects
FOR SELECT
USING (bucket_id = 'posting-media');

-- Update timestamp trigger for media_library
CREATE TRIGGER update_media_library_updated_at
BEFORE UPDATE ON public.media_library
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- Update timestamp trigger for group_posting_settings
CREATE TRIGGER update_group_posting_settings_updated_at
BEFORE UPDATE ON public.group_posting_settings
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- Update timestamp trigger for posting_messages
CREATE TRIGGER update_posting_messages_updated_at
BEFORE UPDATE ON public.posting_messages
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();