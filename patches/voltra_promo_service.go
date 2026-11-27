package stars

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"strings"
	"time"

	"telesrv/internal/domain"
)

// All promo codes are accepted immediately while active in the shared public
// registry. The day field controls the website display only.
const voltraPromoRegistryURL = "https://raw.githubusercontent.com/Chelixxx/chelixxx-giftbot-gramsrv/voltra-landing/voltra-landing/promos.json"

type voltraPromoLedger interface {
	CreditPromo(ctx context.Context, userID int64, code string, randomID int64, amount int64, date int) (domain.StarsBalance, error)
}

type voltraPromoRegistry struct {
	Promos []struct {
		Code   string `json:"code"`
		Stars  int64  `json:"stars"`
		Active bool   `json:"active"`
	} `json:"promos"`
}

var voltraPromoHTTPClient = &http.Client{Timeout: 6 * time.Second}

func validVoltraPromoCode(code string) bool {
	if len(code) < 3 || len(code) > 32 {
		return false
	}
	for _, ch := range code {
		if !((ch >= 'A' && ch <= 'Z') || (ch >= '0' && ch <= '9') || ch == '-' || ch == '_') {
			return false
		}
	}
	return true
}

// RedeemPromo validates a code against the same public JSON file used by the
// website, then atomically records the per-account claim and credits the Stars
// ledger. randomID makes a retry of the exact MTProto request idempotent.
func (s *Service) RedeemPromo(ctx context.Context, userID int64, rawCode string, randomID int64) (domain.StarsBalance, error) {
	code := strings.ToUpper(strings.TrimSpace(rawCode))
	if userID <= 0 || randomID == 0 || !validVoltraPromoCode(code) {
		return domain.StarsBalance{}, domain.ErrStarsPromoInvalid
	}

	ledger, ok := s.store.(voltraPromoLedger)
	if !ok {
		return domain.StarsBalance{}, domain.ErrStarsPromoUnavailable
	}

	requestCtx, cancel := context.WithTimeout(ctx, 7*time.Second)
	defer cancel()
	req, err := http.NewRequestWithContext(requestCtx, http.MethodGet, voltraPromoRegistryURL, nil)
	if err != nil {
		return domain.StarsBalance{}, domain.ErrStarsPromoUnavailable
	}
	req.Header.Set("Accept", "application/json")
	req.Header.Set("Cache-Control", "no-cache")
	req.Header.Set("User-Agent", "VOLTRA-server/1.0")

	resp, err := voltraPromoHTTPClient.Do(req)
	if err != nil {
		return domain.StarsBalance{}, fmt.Errorf("%w: %v", domain.ErrStarsPromoUnavailable, err)
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		return domain.StarsBalance{}, fmt.Errorf("%w: registry HTTP %d", domain.ErrStarsPromoUnavailable, resp.StatusCode)
	}

	const maxRegistryBytes = 1 << 20
	body, err := io.ReadAll(io.LimitReader(resp.Body, maxRegistryBytes+1))
	if err != nil || len(body) > maxRegistryBytes {
		return domain.StarsBalance{}, domain.ErrStarsPromoUnavailable
	}
	var registry voltraPromoRegistry
	if err := json.Unmarshal(body, &registry); err != nil {
		return domain.StarsBalance{}, fmt.Errorf("%w: invalid JSON", domain.ErrStarsPromoUnavailable)
	}

	var amount int64
	for _, promo := range registry.Promos {
		if strings.EqualFold(strings.TrimSpace(promo.Code), code) && promo.Active && promo.Stars >= 750 && promo.Stars <= 7500 {
			amount = promo.Stars
			break
		}
	}
	if amount == 0 {
		return domain.StarsBalance{}, domain.ErrStarsPromoInvalid
	}

	return ledger.CreditPromo(ctx, userID, code, randomID, amount, int(s.now().Unix()))
}
