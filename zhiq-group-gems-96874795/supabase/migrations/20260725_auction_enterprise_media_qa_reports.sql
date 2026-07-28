-- Migration: Enterprise Auction Features (Media, Q&A, Reports)
-- Includes tables for multiple images/videos, public Q&A, and reporting features.

-- ==============================================================================
-- 1. AUCTION MEDIA
-- ==============================================================================
CREATE TABLE IF NOT EXISTS public.auction_media (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    auction_listing_id UUID NOT NULL REFERENCES public.auction_listings(id) ON DELETE CASCADE,
    media_type TEXT NOT NULL CHECK (media_type IN ('image', 'video')),
    storage_path TEXT,
    public_url TEXT,
    position INTEGER DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.auction_media ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Auction media is viewable by everyone" 
    ON public.auction_media FOR SELECT 
    USING (true);

-- Insert/Update/Delete typically handled via RPC or Seller policies, but for safety we allow the store owner.
CREATE POLICY "Store owners can manage their auction media" 
    ON public.auction_media FOR ALL 
    USING (
        EXISTS (
            SELECT 1 FROM public.auction_listings al
            JOIN public.merchant_stores ms ON ms.id = al.store_id
            WHERE al.id = auction_media.auction_listing_id 
            AND ms.user_id = auth.uid()
        )
    );

-- ==============================================================================
-- 2. AUCTION QUESTIONS
-- ==============================================================================
CREATE TABLE IF NOT EXISTS public.auction_questions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    auction_listing_id UUID NOT NULL REFERENCES public.auction_listings(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES auth.users(id),
    question_text TEXT NOT NULL,
    answer_text TEXT,
    answered_at TIMESTAMPTZ,
    is_public BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.auction_questions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public questions are viewable by everyone" 
    ON public.auction_questions FOR SELECT 
    USING (is_public = true OR user_id = auth.uid());

CREATE POLICY "Authenticated users can ask questions" 
    ON public.auction_questions FOR INSERT 
    WITH CHECK (auth.role() = 'authenticated' AND user_id = auth.uid());

CREATE POLICY "Store owners can answer questions" 
    ON public.auction_questions FOR UPDATE 
    USING (
        EXISTS (
            SELECT 1 FROM public.auction_listings al
            JOIN public.merchant_stores ms ON ms.id = al.store_id
            WHERE al.id = auction_questions.auction_listing_id 
            AND ms.user_id = auth.uid()
        )
    );

-- ==============================================================================
-- 3. AUCTION REPORTS
-- ==============================================================================
CREATE TABLE IF NOT EXISTS public.auction_reports (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    auction_listing_id UUID NOT NULL REFERENCES public.auction_listings(id) ON DELETE CASCADE,
    reporter_user_id UUID NOT NULL REFERENCES auth.users(id),
    reason TEXT NOT NULL,
    details TEXT,
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'reviewed', 'dismissed', 'action_taken')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.auction_reports ENABLE ROW LEVEL SECURITY;

-- Reports are only viewable by the user who created them or admins.
CREATE POLICY "Users can view their own reports" 
    ON public.auction_reports FOR SELECT 
    USING (reporter_user_id = auth.uid());

CREATE POLICY "Authenticated users can report" 
    ON public.auction_reports FOR INSERT 
    WITH CHECK (auth.role() = 'authenticated' AND reporter_user_id = auth.uid());

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_auction_media_listing_id ON public.auction_media(auction_listing_id);
CREATE INDEX IF NOT EXISTS idx_auction_questions_listing_id ON public.auction_questions(auction_listing_id);
CREATE INDEX IF NOT EXISTS idx_auction_reports_listing_id ON public.auction_reports(auction_listing_id);

-- Notify trigger for new questions (Optional - if we want real time later)
-- We can add a function to notify the store owner, but for now standard RLS is sufficient.
