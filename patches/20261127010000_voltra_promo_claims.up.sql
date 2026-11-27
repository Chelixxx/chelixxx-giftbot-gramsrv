CREATE TABLE public.voltra_promo_claims (
    promo_code text NOT NULL,
    user_id bigint NOT NULL,
    random_id bigint NOT NULL,
    stars_amount bigint NOT NULL,
    claimed_at timestamp with time zone NOT NULL DEFAULT now(),
    CONSTRAINT voltra_promo_claims_pkey PRIMARY KEY (promo_code, user_id),
    CONSTRAINT voltra_promo_claims_shape_check CHECK (
        length(promo_code) BETWEEN 3 AND 32 AND
        promo_code ~ '^[A-Z0-9_-]+$' AND
        user_id > 0 AND random_id <> 0 AND
        stars_amount BETWEEN 750 AND 7500
    )
);

CREATE INDEX voltra_promo_claims_user_idx
    ON public.voltra_promo_claims(user_id, claimed_at DESC);
