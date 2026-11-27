package domain

import "errors"

var (
	ErrStarsPromoInvalid      = errors.New("stars: promo code is invalid or inactive")
	ErrStarsPromoAlreadyUsed  = errors.New("stars: promo code already used by this account")
	ErrStarsPromoUnavailable  = errors.New("stars: promo registry unavailable")
)
