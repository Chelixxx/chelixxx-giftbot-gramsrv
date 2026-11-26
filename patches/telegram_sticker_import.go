package files

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"os"
	"path/filepath"
	"strings"
	"sync"
	"time"

	"golang.org/x/sync/singleflight"

	"telesrv/internal/domain"
)

const (
	telegramStickerFileLimit = int64(20 << 20)
	telegramStickerSetLimit  = 200
)

type telegramStickerImportResult struct {
	Set       domain.StickerSet
	Documents []domain.Document
	Imported  bool
}

type telegramBotStickerSet struct {
	Name        string                 `json:"name"`
	Title       string                 `json:"title"`
	StickerType string                 `json:"sticker_type"`
	Stickers    []telegramBotSticker   `json:"stickers"`
}

type telegramBotSticker struct {
	FileID         string `json:"file_id"`
	FileSize       int64  `json:"file_size"`
	Type           string `json:"type"`
	Width          int    `json:"width"`
	Height         int    `json:"height"`
	IsAnimated     bool   `json:"is_animated"`
	IsVideo        bool   `json:"is_video"`
	Emoji          string `json:"emoji"`
	NeedsRepainting bool  `json:"needs_repainting"`
}

type telegramBotFile struct {
	FilePath string `json:"file_path"`
	FileSize int64  `json:"file_size"`
}

type telegramBotEnvelope struct {
	OK          bool            `json:"ok"`
	Description string          `json:"description"`
	Result      json.RawMessage `json:"result"`
}

var (
	telegramStickerImportGroup singleflight.Group
	telegramStickerHTTPClient  = &http.Client{Timeout: 35 * time.Second}
	telegramStickerFileSlots   = make(chan struct{}, 6)
)

// ImportTelegramStickerSet imports a public sticker or custom-emoji set on first
// request. The Bot API token stays server-side and is never sent to the client.
// The dedicated variable is preferred; SNEG_BOT_TOKEN is retained as the
// deployment's existing bot-token fallback.
func (s *Service) ImportTelegramStickerSet(ctx context.Context, shortName string) (domain.StickerSet, []domain.Document, bool, error) {
	shortName = strings.TrimSpace(shortName)
	if !validTelegramStickerShortName(shortName) {
		return domain.StickerSet{}, nil, false, nil
	}
	if s != nil {
		existing, documents, found, err := s.ResolveStickerSet(ctx, domain.StickerSetRef{
			Kind: domain.StickerSetRefByShortName, ShortName: shortName,
		})
		if err != nil {
			return domain.StickerSet{}, nil, false, fmt.Errorf("check existing VOLTRA sticker set: %w", err)
		}
		if found && !existing.Deleted {
			return existing, documents, false, nil
		}
	}

	token := strings.TrimSpace(os.Getenv("TELESRV_TELEGRAM_STICKER_IMPORT_BOT_TOKEN"))
	if token == "" {
		token = strings.TrimSpace(os.Getenv("SNEG_BOT_TOKEN"))
	}
	if !validTelegramBotToken(token) {
		return domain.StickerSet{}, nil, false, fmt.Errorf("Telegram sticker importer is not configured")
	}

	value, err, _ := telegramStickerImportGroup.Do(strings.ToLower(shortName), func() (any, error) {
		return s.importTelegramStickerSet(ctx, token, shortName)
	})
	if err != nil {
		return domain.StickerSet{}, nil, false, err
	}
	result, ok := value.(telegramStickerImportResult)
	if !ok {
		return domain.StickerSet{}, nil, false, fmt.Errorf("unexpected Telegram sticker import result")
	}
	return result.Set, result.Documents, result.Imported, nil
}

func (s *Service) importTelegramStickerSet(ctx context.Context, token, shortName string) (telegramStickerImportResult, error) {
	if s == nil {
		return telegramStickerImportResult{}, fmt.Errorf("files service is unavailable")
	}

	var remote telegramBotStickerSet
	if err := telegramBotCall(ctx, token, "getStickerSet", url.Values{"name": []string{shortName}}, &remote); err != nil {
		return telegramStickerImportResult{}, fmt.Errorf("Telegram getStickerSet failed: %w", err)
	}
	if remote.Name == "" || len(remote.Stickers) == 0 {
		return telegramStickerImportResult{}, fmt.Errorf("Telegram returned an empty sticker set")
	}
	kind := domain.StickerSetKindStickers
	switch remote.StickerType {
	case "", "regular":
		kind = domain.StickerSetKindStickers
	case "custom_emoji":
		kind = domain.StickerSetKindEmoji
	default:
		return telegramStickerImportResult{}, fmt.Errorf("Telegram set type %q is not supported", remote.StickerType)
	}
	maxSetSize := telegramStickerSetLimit
	if kind != domain.StickerSetKindEmoji {
		maxSetSize = 120
	}
	if len(remote.Stickers) > maxSetSize {
		return telegramStickerImportResult{}, fmt.Errorf("Telegram set has %d items; VOLTRA currently supports up to %d for this type", len(remote.Stickers), maxSetSize)
	}

	// Keep a human-readable copy on the Railway persistent volume as well as
	// the canonical blob-store/DB import used by VOLTRA clients.
	exportRoot := strings.TrimSpace(os.Getenv("TELESRV_STICKER_IMPORT_EXPORT_DIR"))
	if exportRoot == "" {
		exportRoot = "/var/lib/telesrv/imported-stickers"
	}
	exportKind := "stickers"
	if kind == domain.StickerSetKindEmoji {
		exportKind = "emoji"
	}
	packExportDir := filepath.Join(exportRoot, exportKind, shortName)
	if err := os.MkdirAll(packExportDir, 0750); err != nil {
		return telegramStickerImportResult{}, fmt.Errorf("create VOLTRA sticker export folder: %w", err)
	}

	items := make([]domain.StickerSetItemInput, len(remote.Stickers))
	var firstErr error
	var firstErrOnce sync.Once
	var wait sync.WaitGroup
	for i := range remote.Stickers {
		i := i
		wait.Add(1)
		go func() {
			defer wait.Done()
			select {
			case telegramStickerFileSlots <- struct{}{}:
				defer func() { <-telegramStickerFileSlots }()
			case <-ctx.Done():
				firstErrOnce.Do(func() { firstErr = ctx.Err() })
				return
			}

			sticker := remote.Stickers[i]
			data, extension, err := downloadTelegramSticker(ctx, token, sticker)
			if err != nil {
				firstErrOnce.Do(func() { firstErr = fmt.Errorf("download Telegram sticker %d: %w", i+1, err) })
				return
			}
			doc, err := s.AdminUploadStickerMaterial(ctx, fmt.Sprintf("telegram_%03d.%s", i+1, extension), data)
			if err != nil {
				firstErrOnce.Do(func() { firstErr = fmt.Errorf("store Telegram sticker %d: %w", i+1, err) })
				return
			}
			exportName := filepath.Join(packExportDir, fmt.Sprintf("%03d.%s", i+1, extension))
			if err := os.WriteFile(exportName, data, 0640); err != nil {
				firstErrOnce.Do(func() { firstErr = fmt.Errorf("export Telegram sticker %d to persistent folder: %w", i+1, err) })
				return
			}
			if extension == "webm" {
				doc.Attributes = append(doc.Attributes, domain.DocumentAttribute{
					Kind:              domain.DocAttrVideo,
					W:                 sticker.Width,
					H:                 sticker.Height,
					VideoCodec:        "vp9",
					NoSound:           true,
					SupportsStreaming: true,
				})
				if err := s.media.PutDocument(ctx, doc); err != nil {
					firstErrOnce.Do(func() { firstErr = fmt.Errorf("save Telegram video sticker %d metadata: %w", i+1, err) })
					return
				}
			}

			emoji := strings.TrimSpace(sticker.Emoji)
			if emoji == "" {
				emoji = "🙂"
			}
			items[i] = domain.StickerSetItemInput{
				DocumentID:         doc.ID,
				DocumentAccessHash: doc.AccessHash,
				Emoji:              emoji,
			}
		}()
	}
	wait.Wait()
	if firstErr != nil {
		return telegramStickerImportResult{}, firstErr
	}
	if err := ctx.Err(); err != nil {
		return telegramStickerImportResult{}, err
	}

	textColor := false
	for _, sticker := range remote.Stickers {
		textColor = textColor || sticker.NeedsRepainting
	}
	title := strings.TrimSpace(remote.Title)
	if title == "" {
		title = shortName
	}
	set, docs, err := s.createStickerSet(ctx, domain.CreateStickerSetRequest{
		Title:     title,
		ShortName: shortName,
		Kind:      kind,
		TextColor: textColor,
		Items:     items,
		Software:  "Telegram Bot API import",
		Date:      int(time.Now().Unix()),
	})
	if err != nil {
		return telegramStickerImportResult{}, fmt.Errorf("create VOLTRA sticker set: %v", err)
	}
	return telegramStickerImportResult{Set: set, Documents: docs, Imported: true}, nil
}

func downloadTelegramSticker(ctx context.Context, token string, sticker telegramBotSticker) ([]byte, string, error) {
	if sticker.FileID == "" || sticker.FileSize < 0 || sticker.FileSize > telegramStickerFileLimit {
		return nil, "", fmt.Errorf("Telegram sticker file metadata is invalid or too large")
	}
	var remoteFile telegramBotFile
	if err := telegramBotCall(ctx, token, "getFile", url.Values{"file_id": []string{sticker.FileID}}, &remoteFile); err != nil {
		return nil, "", err
	}
	if remoteFile.FilePath == "" || remoteFile.FileSize > telegramStickerFileLimit {
		return nil, "", fmt.Errorf("Telegram did not return a downloadable file path")
	}

	extension := "webp"
	switch {
	case sticker.IsVideo:
		extension = "webm"
	case sticker.IsAnimated:
		extension = "tgs"
	}
	fileURL, err := telegramFileURL(token, remoteFile.FilePath)
	if err != nil {
		return nil, "", err
	}
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, fileURL, nil)
	if err != nil {
		return nil, "", fmt.Errorf("create Telegram file request: %w", err)
	}
	resp, err := telegramStickerHTTPClient.Do(req)
	if err != nil {
		return nil, "", fmt.Errorf("fetch Telegram sticker file failed")
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		return nil, "", fmt.Errorf("Telegram file endpoint returned HTTP %d", resp.StatusCode)
	}
	data, err := io.ReadAll(io.LimitReader(resp.Body, telegramStickerFileLimit+1))
	if err != nil {
		return nil, "", fmt.Errorf("read Telegram sticker file: %w", err)
	}
	if len(data) == 0 || int64(len(data)) > telegramStickerFileLimit {
		return nil, "", fmt.Errorf("Telegram sticker file is empty or exceeds %d bytes", telegramStickerFileLimit)
	}
	return data, extension, nil
}

func telegramBotCall(ctx context.Context, token, method string, query url.Values, result any) error {
	endpoint := "https://api.telegram.org/bot" + token + "/" + method
	if len(query) > 0 {
		endpoint += "?" + query.Encode()
	}
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, endpoint, nil)
	if err != nil {
		return fmt.Errorf("create Telegram Bot API request failed")
	}
	resp, err := telegramStickerHTTPClient.Do(req)
	if err != nil {
		return fmt.Errorf("connect to Telegram Bot API failed")
	}
	defer resp.Body.Close()
	body, err := io.ReadAll(io.LimitReader(resp.Body, 2<<20))
	if err != nil {
		return fmt.Errorf("read Telegram Bot API response: %w", err)
	}
	var envelope telegramBotEnvelope
	if err := json.Unmarshal(body, &envelope); err != nil {
		if resp.StatusCode != http.StatusOK {
			return fmt.Errorf("Telegram Bot API returned HTTP %d with an unreadable response", resp.StatusCode)
		}
		return fmt.Errorf("decode Telegram Bot API response: %w", err)
	}
	if resp.StatusCode != http.StatusOK || !envelope.OK {
		description := strings.TrimSpace(envelope.Description)
		if description == "" {
			description = "request rejected"
		}
		return fmt.Errorf("Telegram Bot API HTTP %d: %s", resp.StatusCode, description)
	}
	if result == nil {
		return nil
	}
	if err := json.Unmarshal(envelope.Result, result); err != nil {
		return fmt.Errorf("decode Telegram Bot API result: %w", err)
	}
	return nil
}

func telegramFileURL(token, filePath string) (string, error) {
	if filePath == "" || strings.Contains(filePath, "\\") {
		return "", fmt.Errorf("Telegram returned an invalid file path")
	}
	parts := strings.Split(strings.Trim(filePath, "/"), "/")
	for i, part := range parts {
		if part == "" || part == "." || part == ".." {
			return "", fmt.Errorf("Telegram returned an invalid file path")
		}
		parts[i] = url.PathEscape(part)
	}
	return "https://api.telegram.org/file/bot" + token + "/" + strings.Join(parts, "/"), nil
}

func validTelegramStickerShortName(value string) bool {
	if len(value) < domain.MinStickerSetShortNameLen || len(value) > 64 {
		return false
	}
	for _, r := range value {
		if (r >= 'a' && r <= 'z') || (r >= 'A' && r <= 'Z') || (r >= '0' && r <= '9') || r == '_' {
			continue
		}
		return false
	}
	return true
}

func validTelegramBotToken(value string) bool {
	if len(value) < 20 || len(value) > 256 || strings.Count(value, ":") != 1 {
		return false
	}
	for _, r := range value {
		if (r >= 'a' && r <= 'z') || (r >= 'A' && r <= 'Z') || (r >= '0' && r <= '9') || r == ':' || r == '_' || r == '-' {
			continue
		}
		return false
	}
	return true
}

// Telegram video sticker files use the EBML container signature.
func validTelegramWebMStickerData(data []byte) bool {
	return len(data) >= 4 && data[0] == 0x1a && data[1] == 0x45 && data[2] == 0xdf && data[3] == 0xa3
}
