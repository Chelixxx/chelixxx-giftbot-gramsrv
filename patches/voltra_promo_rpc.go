package rpc

import (
	"context"
	"errors"
	"strings"

	"go.uber.org/zap"

	"github.com/iamxvbaba/td/tg"
	"github.com/iamxvbaba/td/tgerr"

	"telesrv/internal/domain"
)

type voltraPromoRedeemer interface {
	RedeemPromo(ctx context.Context, userID int64, code string, randomID int64) (domain.StarsBalance, error)
}

// tryRedeemVoltraPromo handles /promo_code only in the authenticated user's
// Saved Messages peer. No caller-supplied account ID is accepted.
func (r *Router) tryRedeemVoltraPromo(ctx context.Context, req *tg.MessagesSendMessageRequest) (tg.UpdatesClass, bool, error) {
	if req == nil {
		return nil, false, nil
	}
	fields := strings.Fields(strings.TrimSpace(req.Message))
	if len(fields) == 0 {
		return nil, false, nil
	}
	command := strings.ToLower(strings.SplitN(fields[0], "@", 2)[0])
	if command != "/promo_code" {
		return nil, false, nil
	}

	userID, _, err := r.currentUserID(ctx)
	if err != nil || userID <= 0 {
		return nil, true, tgerr.New(401, "AUTH_KEY_UNREGISTERED")
	}
	peer, ok := r.domainPeerFromInputPeer(userID, req.Peer)
	if !ok || peer.Type != domain.PeerTypeUser || peer.ID != userID {
		// Do not intercept this text in other users' chats or groups.
		return nil, false, nil
	}
	if req.RandomID == 0 {
		return nil, true, randomIDEmptyErr()
	}
	if req.ScheduleRepeatPeriod != 0 || req.ScheduleDate != 0 || req.QuickReplyShortcut != nil {
		return nil, true, tgerr.New(400, "PROMO_REQUEST_INVALID")
	}
	if len(fields) != 2 {
		return nil, true, tgerr.New(400, "PROMO_CODE_INVALID")
	}

	redeemer, ok := r.deps.Stars.(voltraPromoRedeemer)
	if !ok || redeemer == nil {
		return nil, true, tgerr.New(503, "PROMO_SERVICE_UNAVAILABLE")
	}
	balance, err := redeemer.RedeemPromo(ctx, userID, fields[1], req.RandomID)
	switch {
	case err == nil:
	case errors.Is(err, domain.ErrStarsPromoInvalid):
		return nil, true, tgerr.New(400, "PROMO_CODE_INVALID")
	case errors.Is(err, domain.ErrStarsPromoAlreadyUsed):
		return nil, true, tgerr.New(400, "PROMO_ALREADY_USED")
	case errors.Is(err, domain.ErrStarsPromoUnavailable):
		return nil, true, tgerr.New(503, "PROMO_SERVICE_UNAVAILABLE")
	default:
		if r.log != nil {
			r.log.Error("VOLTRA promo redemption failed", zap.Error(err))
		}
		return nil, true, internalErr()
	}

	updates := &tg.Updates{
		Updates: []tg.UpdateClass{
			&tg.UpdateStarsBalance{Balance: &tg.StarsAmount{Amount: balance.Balance}},
		},
		Date: int(r.clock.Now().Unix()),
	}
	return updates, true, nil
}
