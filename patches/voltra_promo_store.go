package postgres

import (
	"context"
	"errors"
	"fmt"

	"github.com/jackc/pgx/v5"

	"telesrv/internal/domain"
)

// CreditPromo commits the claim, balance update and Stars journal row together.
// A replay with the same random_id returns the current balance without minting
// again; a different request for an already claimed code is rejected.
func (s *StarsStore) CreditPromo(ctx context.Context, userID int64, code string, randomID int64, amount int64, date int) (domain.StarsBalance, error) {
	if userID <= 0 || code == "" || randomID == 0 || amount < 750 || amount > 10000 || date <= 0 {
		return domain.StarsBalance{}, domain.ErrStarsInvalidAmount
	}

	out := domain.StarsBalance{UserID: userID}
	err := withTx(ctx, s.db, "redeem VOLTRA promo", func(tx pgx.Tx) error {
		var insertedRandomID int64
		err := tx.QueryRow(ctx, `
INSERT INTO public.voltra_promo_claims (promo_code, user_id, random_id, stars_amount)
VALUES ($1, $2, $3, $4)
ON CONFLICT (promo_code, user_id) DO NOTHING
RETURNING random_id`, code, userID, randomID, amount).Scan(&insertedRandomID)

		if errors.Is(err, pgx.ErrNoRows) {
			var previousRandomID int64
			if err := tx.QueryRow(ctx, `
SELECT random_id
FROM public.voltra_promo_claims
WHERE promo_code = $1 AND user_id = $2
FOR UPDATE`, code, userID).Scan(&previousRandomID); err != nil {
				return fmt.Errorf("read existing VOLTRA promo claim: %w", err)
			}
			if previousRandomID != randomID {
				return domain.ErrStarsPromoAlreadyUsed
			}
			if err := tx.QueryRow(ctx, `
SELECT balance, granted
FROM stars_balances
WHERE user_id = $1`, userID).Scan(&out.Balance, &out.Granted); err != nil {
				return fmt.Errorf("read balance for promo retry: %w", err)
			}
			return nil
		}
		if err != nil {
			return fmt.Errorf("insert VOLTRA promo claim: %w", err)
		}

		if err := tx.QueryRow(ctx, `
INSERT INTO stars_balances (user_id, balance, updated_at)
VALUES ($1, $2, now())
ON CONFLICT (user_id) DO UPDATE
SET balance = stars_balances.balance + EXCLUDED.balance,
    updated_at = now()
RETURNING balance, granted`, userID, amount).Scan(&out.Balance, &out.Granted); err != nil {
			return fmt.Errorf("credit VOLTRA promo Stars: %w", err)
		}

		return insertStarsTxn(ctx, tx, userID, amount, domain.StarsReasonTopup, domain.Peer{}, date, "Промокод VOLTRA", code)
	})
	if err != nil {
		return domain.StarsBalance{}, err
	}
	return out, nil
}
