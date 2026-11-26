package files

import (
 "context"
 "fmt"
 "net/url"
 "os"
 "strconv"
 "strings"
 "time"
 "go.uber.org/zap"
)

type telegramStickerBotUpdate struct {
 UpdateID int64 `json:"update_id"`
 Message *telegramStickerBotMessage `json:"message"`
}
type telegramStickerBotMessage struct {
 Text string `json:"text"`
 From struct { ID int64 `json:"id"` } `json:"from"`
 Chat struct { ID int64 `json:"id"`; Type string `json:"type"` } "json:\"chat\""
}
type telegramStickerBotWebhook struct { URL string `json:"url"` }

func (s *Service) StartTelegramStickerImportBot(ctx context.Context, logger *zap.Logger) {
 if s == nil { return }
 if logger == nil { logger = zap.NewNop() }
 token := strings.TrimSpace(os.Getenv("TELESRV_TELEGRAM_STICKER_IMPORT_BOT_TOKEN"))
 if token == "" { token = strings.TrimSpace(os.Getenv("SNEG_BOT_TOKEN")) }
 if !validTelegramBotToken(token) { logger.Warn("sticker import bot disabled: bot token missing"); return }
 ownerID, _ := strconv.ParseInt(strings.TrimSpace(os.Getenv("TELESRV_STICKER_IMPORT_OWNER_ID")), 10, 64)
 go s.runTelegramStickerImportBot(ctx, token, ownerID, logger)
}

func (s *Service) runTelegramStickerImportBot(ctx context.Context, token string, ownerID int64, logger *zap.Logger) {
 var webhook telegramStickerBotWebhook
 if err := telegramBotCall(ctx, token, "getWebhookInfo", nil, &webhook); err == nil && webhook.URL != "" {
  logger.Warn("sticker import bot skipped: webhook is configured")
  return
 }
 logger.Info("Telegram sticker import bot polling started", zap.Bool("owner_configured", ownerID > 0))
 var offset int64
 for ctx.Err() == nil {
  query := url.Values{"timeout": {"25"}, "allowed_updates": {`["message"]`}}
  if offset > 0 { query.Set("offset", strconv.FormatInt(offset, 10)) }
  var updates []telegramStickerBotUpdate
  if err := telegramBotCall(ctx, token, "getUpdates", query, &updates); err != nil {
   if ctx.Err() != nil { return }
   logger.Warn("sticker import bot polling failed", zap.Error(err))
   select { case <-ctx.Done(): return; case <-time.After(5*time.Second): }
   continue
  }
  for _, update := range updates {
   if update.UpdateID >= offset { offset = update.UpdateID + 1 }
   if update.Message == nil || update.Message.Chat.Type != "private" { continue }
   m := update.Message
   reply := ""
   if strings.HasPrefix(strings.TrimSpace(m.Text), "/id") || strings.HasPrefix(strings.TrimSpace(m.Text), "/start") {
    reply = fmt.Sprintf("Ваш Telegram ID: %d. Передайте его владельцу VOLTRA для привязки бота.", m.From.ID)
    if ownerID > 0 && m.From.ID == ownerID { reply = "Бот VOLTRA готов. Пришлите ссылку t.me/addstickers/... или t.me/addemoji/..." }
   } else if ownerID <= 0 {
    reply = "Бот ещё не привязан. Отправьте /id и передайте полученный номер владельцу VOLTRA."
   } else if m.From.ID != ownerID {
    continue
   } else {
    shortName, kind, ok := telegramStickerSetFromText(m.Text)
    if !ok { reply = "Пришлите ссылку t.me/addstickers/ИМЯ или t.me/addemoji/ИМЯ" } else {
     _ = telegramBotCall(ctx, token, "sendMessage", url.Values{"chat_id": {strconv.FormatInt(m.Chat.ID,10)}, "text": {"Скачиваю файлы в хранилище VOLTRA…"}}, nil)
     importCtx, cancel := context.WithTimeout(ctx, 4*time.Minute)
     set, docs, imported, err := s.ImportTelegramStickerSet(importCtx, shortName)
     cancel()
     if err != nil { reply = "Ошибка импорта: " + err.Error() } else if imported { reply = fmt.Sprintf("Готово! «%s»: %d файлов добавлено в VOLTRA (%s).", set.Title, len(docs), kind) } else { reply = fmt.Sprintf("«%s» уже есть в VOLTRA. Файлов: %d.", set.Title, len(docs)) }
    }
   }
   if reply != "" { _ = telegramBotCall(ctx, token, "sendMessage", url.Values{"chat_id": {strconv.FormatInt(m.Chat.ID,10)}, "text": {reply}}, nil) }
  }
 }
}

func telegramStickerSetFromText(text string) (string, string, bool) {
 for _, field := range strings.Fields(text) {
  candidate := strings.Trim(field, "<>()[]{}.,;!?\\\"'")
  if !strings.Contains(candidate, "://") { candidate = "https://" + strings.TrimPrefix(candidate, "@") }
  parsed, err := url.Parse(candidate); if err != nil { continue }
  scheme := strings.ToLower(parsed.Scheme)
  host := strings.ToLower(strings.TrimPrefix(parsed.Hostname(), "www."))
  if scheme == "tg" {
   kind := ""
   switch host {
   case "addstickers": kind = "стикеры"
   case "addemoji": kind = "эмодзи"
   default: continue
   }
   shortName := parsed.Query().Get("set")
   if validTelegramStickerShortName(shortName) { return shortName, kind, true }
   continue
  }
  if host != "t.me" && host != "telegram.me" { continue }
  parts := strings.Split(strings.Trim(parsed.Path, "/"), "/")
  if len(parts) != 2 { continue }
  kind := ""
  switch strings.ToLower(parts[0]) { case "addstickers": kind = "стикеры"; case "addemoji": kind = "эмодзи"; default: continue }
  if validTelegramStickerShortName(parts[1]) { return parts[1], kind, true }
 }
 return "", "", false
}
