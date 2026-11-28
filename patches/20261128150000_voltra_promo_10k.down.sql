ALTER TABLE public.voltra_promo_claims
    DROP CONSTRAINT IF EXISTS voltra_promo_claims_shape_check;

ALTER TABLE public.voltra_promo_claims
    ADD CONSTRAINT voltra_promo_claims_shape_check CHECK (
        length(promo_code) BETWEEN 3 AND 32 AND
        promo_code ~ '^[A-Z0-9_-]+$' AND
        user_id > 0 AND random_id <> 0 AND
        stars_amount BETWEEN 750 AND 7500
    );
