import fs from 'node:fs';
import path from 'node:path';

const root = process.argv[2];
if(!root) throw new Error('Pass the extracted Web client directory as the first argument.');

function replaceOnce(file, oldText, newText, label) {
  const filePath = path.join(root, file);
  const source = fs.readFileSync(filePath, 'utf8');
  const count = source.split(oldText).length - 1;
  if(count !== 1) throw new Error('Patch "' + label + '" expected exactly one match in ' + file + ', found ' + count + '.');
  fs.writeFileSync(filePath, source.replace(oldText, newText), 'utf8');
}

const railwayKey = 'bfd71296999350d47aeeee35bce83a67bfa3709559cbfd84871386d2bea4bfcee2614339ac63f6856b7c1e26a798a0964e42da82089dc5232bea4f11123e25e1ab8d2d769d7a1a928f99cc5b4118544f9c9f9c4bf365647a37659c81155d4a35c8962fd82edb6fb517c3792123205fe56f824077ede25c5638ad701dff404663c181cd7cc716eece0f4027962f28bd3533473044a5587a9ce0674ab284a0e1f6d45a4f4ae2ef50b964b5e7af51e80398d32e4ebf623cd4c2f578fac1349b932af667249b8d891a0ee09604a83ea116fae36a5fea400fdd2ece7a8cd05cde0c7c6de04cec11c90bfa0130262d54fd7518ad8e54e0d679ef70be24755d226f2d45';

replaceOnce(
  'src/lib/mtproto/rsaKeysManager.ts',
  '  }];\n\n  private publicKeysParsed: {',
  "  }, {\n    // VOLTRA Railway production server key.\n    // Public key fingerprint: 0x06a330bd65d9ae03.\n    modulus: '" + railwayKey + "',\n    exponent: '010001'\n  }];\n\n  private publicKeysParsed: {",
  'VOLTRA Railway RSA key'
);

const oldHttp = "    const httpPromise = deferredPromise<boolean>();\n" +
"    ((this.transports.https as HTTP)._send(new Uint8Array(), 'no-cors') as any as Promise<any>)\n" +
"    .then(() => httpPromise.resolve(true), () => httpPromise.resolve(false));\n" +
"    setTimeout(() => httpPromise.resolve(false), timeout);";
const newHttp = "    const httpPromise = deferredPromise<boolean>();\n" +
"    const httpTransport = transports.https as HTTP | undefined | null;\n" +
"    if(httpTransport && typeof (httpTransport as any)._send === 'function') {\n" +
"      ((httpTransport as any)._send(new Uint8Array(), 'no-cors') as Promise<any>)\n" +
"      .then(() => httpPromise.resolve(true), () => httpPromise.resolve(false));\n" +
"      setTimeout(() => httpPromise.resolve(false), timeout);\n" +
"    } else {\n" +
"      // Private Telesrv DC has no Telegram HTTP transport.\n" +
"      httpPromise.resolve(false);\n" +
"    }";
replaceOnce('src/lib/mtproto/transports/controller.ts', oldHttp, newHttp, 'HTTP transport guard');

const oldTelegramURLDecl = "  let tgMeMatch, telescoPeMatch, tgMatch;";
const newTelegramURLDecl = "  let tgMeMatch, telescoPeMatch, tgMatch, telegramPackMatch;";
replaceOnce('src/lib/richTextProcessor/wrapUrl.ts', oldTelegramURLDecl, newTelegramURLDecl, 'Recognize Telegram sticker links');

const oldTelescoPeBranch = String.raw`} else if((telescoPeMatch = url.match(/^(?:https?:\/\/)?telesco\.pe\/([^/?]+)\/(\d+)/))) {`;
const newTelescoPeBranch = String.raw`} else if((telegramPackMatch = url.match(/^(?:https?:\/\/)?(?:www\.)?(?:t\.me|telegram\.me)\/(addstickers|addemoji)\/([A-Za-z0-9_]+)/i))) {
    const linkType = telegramPackMatch[1].toLowerCase();
    onclick = ('telesrv_' + linkType) as any;
    out.url = 'telesrv://' + linkType + '?set=' + encodeURIComponent(telegramPackMatch[2]);
  } else if((telescoPeMatch = url.match(/^(?:https?:\/\/)?telesco\.pe\/([^/?]+)\/(\d+)/))) {`;
replaceOnce('src/lib/richTextProcessor/wrapUrl.ts', oldTelescoPeBranch, newTelescoPeBranch, 'Open original Telegram sticker and emoji links inside VOLTRA');

replaceOnce(
  'src/components/popups/stickers.tsx',
  "const prefix = `https://telesrv.net/${isEmojis ? 'addemoji' : 'addstickers'}/`;",
  "const prefix = `https://t.me/${isEmojis ? 'addemoji' : 'addstickers'}/`;",
  'Copy original Telegram sticker and emoji links'
);


const oldSocket = "    const websocketPromise = deferredPromise<boolean>();\n" +
"    const socket = transports.websocket as TcpObfuscated;\n" +
"    socket.setAutoReconnect(false);\n" +
"    socket.connection.addEventListener('close', () => websocketPromise.resolve(false), {once: true});\n" +
"    socket.connection.addEventListener('open', () => websocketPromise.resolve(true), {once: true});\n" +
"    setTimeout(() => {\n" +
"      if(websocketPromise.isFulfilled || websocketPromise.isRejected) {\n" +
"        return;\n" +
"      }\n\n" +
"      if(socket.connection) {\n" +
"        socket.connection.close();\n" +
"      }\n\n" +
"      websocketPromise.resolve(false);\n" +
"    }, timeout);";
const newSocket = "    const websocketPromise = deferredPromise<boolean>();\n" +
"    const socket = transports.websocket as TcpObfuscated | undefined | null;\n" +
"    if(socket) {\n" +
"      socket.setAutoReconnect(false);\n" +
"      socket.connection.addEventListener('close', () => websocketPromise.resolve(false), {once: true});\n" +
"      socket.connection.addEventListener('open', () => websocketPromise.resolve(true), {once: true});\n" +
"      setTimeout(() => {\n" +
"        if(websocketPromise.isFulfilled || websocketPromise.isRejected) {\n" +
"          return;\n" +
"        }\n\n" +
"        if(socket.connection) {\n" +
"          socket.connection.close();\n" +
"        }\n\n" +
"        websocketPromise.resolve(false);\n" +
"      }, timeout);\n" +
"    } else {\n" +
"      websocketPromise.resolve(false);\n" +
"    }";
replaceOnce('src/lib/mtproto/transports/controller.ts', oldSocket, newSocket, 'WebSocket transport guard');
replaceOnce('src/lib/mtproto/transports/controller.ts', '      transport.destroy();', '      transport?.destroy();', 'Optional transport cleanup');

const host = process.env.VOLTRA_WEB_HOST || 'voltra-main.layero.app';

function rebrandVisibleText(value) {
  const urls = [];
  let text = value.replace(/https?:\/\/[^\s)\]]+/gi, (url) => {
    const marker = '__VOLTRA_EXTERNAL_URL_' + urls.length + '__';
    urls.push(url);
    return marker;
  });
  text = text
    .replace(/\bTelesrv\b/gi, 'VOLTRA')
    .replace(/\bTelegram\s+Premium\b/gi, 'VOLTRA Premium')
    .replace(/\bTelegram\b/gi, 'VOLTRA')
    .replace(/телеграмм?/gi, 'VOLTRA')
    .replace(/telesrv\.net/gi, host);
  return text.replace(/__VOLTRA_EXTERNAL_URL_(\d+)__/g, (_match, index) => urls[Number(index)]);
}

function rebrandObjectValues(source) {
  return source.replace(/(:\s*)'((?:\\.|[^'\\])*)'/g, (_match, prefix, value) =>
    prefix + "'" + rebrandVisibleText(value) + "'"
  );
}

function replaceObjectValue(source, key, value) {
  const escaped = key.replace(/\./g, '\\.');
  const pattern = new RegExp("(['\"])"+ escaped +"\\1\\s*:\\s*'((?:\\\\.|[^'\\\\])*)'");
  if(!pattern.test(source)) throw new Error('Missing local language key: ' + key);
  const safeValue = value.replace(/\\/g, '\\\\').replace(/\r?\n/g, '\\n').replace(/'/g, "\\'");
  return source.replace(pattern, "'" + key + "': '" + safeValue + "'");
}

replaceOnce("src/config/app.ts", "  langPackCode: 'en',", "  langPackCode: 'ru',", "Set Russian as default language");
replaceOnce("src/index.ts", "    const langPack = await I18n.getCacheLangPackAndApply();\n    setDocumentLangPackProperties(langPack);", "    let langPack = await I18n.getCacheLangPackAndApply();\n    if(langPack.lang_code !== App.langPackCode) {\n      try {\n        langPack = await I18n.getLangPackAndApply(App.langPackCode, true, true);\n      } catch(error) {\n        console.error('VOLTRA Russian language pack could not be loaded; keeping the cached pack.', error);\n      }\n    }\n    setDocumentLangPackProperties(langPack);", "Load Russian pack even when English is cached");
replaceOnce("src/pages/cards/SignInCard.tsx", "import LanguageChangeButton from '@components/languageChangeButton';\n", "", "Remove sign-in locale-switch import");
replaceOnce("src/pages/cards/SignInCard.tsx", "        {getCurrentAccount() === 1 && <LanguageChangeButton />}\n", "", "Remove sign-in locale-switch control");
replaceOnce("src/components/sidebarLeft/tabs/language.tsx", "      <LanguageListSection />", "      <Section>\n        <RowTsx>\n          <RowTsx.Title titleRight=\"Русский\" titleRightSecondary>Язык интерфейса</RowTsx.Title>\n        </RowTsx>\n      </Section>", "Lock the interface language to Russian");

const brand = path.join(root, 'src/config/brand.ts');
let brandText = fs.readFileSync(brand, 'utf8');
const brandReplacements = [
  ["export const TELESRV_NAME = 'Telesrv';", "export const TELESRV_NAME = 'VOLTRA';"],
  ["export const TELESRV_WEB_K_NAME = 'Telesrv Web K';", "export const TELESRV_WEB_K_NAME = 'VOLTRA Web';"],
  ["export const TELESRV_SCHEME = 'telesrv';", "export const TELESRV_SCHEME = 'voltra';"],
  ["export const TELESRV_PUBLIC_HOST = 'telesrv.net';", "export const TELESRV_PUBLIC_HOST = '" + host + "';"],
  ["export const TELESRV_WEB_A_URL = 'https://web.telesrv.net/';", "export const TELESRV_WEB_A_URL = 'https://" + host + "/';"],
  ["export const TELESRV_WEB_K_URL = 'https://webk.telesrv.net/';", "export const TELESRV_WEB_K_URL = 'https://" + host + "/';"],
  ["export const TELESRV_WEB_DOMAINS = ['web.telesrv.net', 'webk.telesrv.net'];", "export const TELESRV_WEB_DOMAINS = ['" + host + "'];"]
];
for(const [from, to] of brandReplacements) {
  const count = brandText.split(from).length - 1;
  if(count !== 1) throw new Error('Brand patch expected one match for: ' + from + ', found ' + count);
  brandText = brandText.replace(from, to);
}
fs.writeFileSync(brand, brandText, 'utf8');

const vitePath = path.join(root, 'vite.config.ts');
let viteText = fs.readFileSync(vitePath, 'utf8');
const oldContext = "  context: {\n" +
"    title: 'Telesrv Web K',\n" +
"    description: 'A private, self-hosted messaging client for telesrv.',\n" +
"    url: 'https://webk.telesrv.net/',\n" +
"    origin: 'https://webk.telesrv.net/'\n" +
"  }";
const newContext = "  context: {\n" +
"    title: 'VOLTRA Web',\n" +
"    description: 'Private messaging on VOLTRA.',\n" +
"    url: 'https://" + host + "/',\n" +
"    origin: 'https://" + host + "/'\n" +
"  }";
const contextCount = viteText.split(oldContext).length - 1;
if(contextCount !== 1) throw new Error('HTML branding patch expected one match, found ' + contextCount + '.');
viteText = viteText.replace(oldContext, newContext);
fs.writeFileSync(vitePath, viteText, 'utf8');

let signInText = fs.readFileSync(path.join(root, 'src/langSign.ts'), 'utf8');
const signInTranslations = {
  "Login.Title": "Войти в VOLTRA",
  "Login.PhoneLabel": "Номер телефона",
  "Login.PhoneLabelInvalid": "Неверный номер телефона",
  "Login.StartText": "Подтвердите код страны\nи введите номер телефона.",
  "Login.Code.SentSms": "Мы отправили SMS\nс кодом подтверждения.",
  "Login.Code.SentInApp": "Мы отправили сообщение в VOLTRA\nс кодом подтверждения.",
  "Login.Code.SentCall": "Мы позвоним вам и продиктуем\nкод подтверждения.",
  "Login.Code.SentEmail": "Проверьте почту **%s** (в том числе папку «Спам») и введите отправленный код.",
  "Login.Code.SentUnknown": "Проверьте сообщения\nна наличие кода (тип: %s)",
  "Login.Password.Title": "Введите пароль",
  "Login.Password.Subtitle": "Ваш аккаунт защищён\nдополнительным паролем",
  "Login.Register.Subtitle": "Укажите имя и добавьте\nфотографию профиля",
  "PleaseWait": "Подождите...",
  "ForgotPassword": "[Забыли пароль?]()",
  "TroubleEmail": "[Нет доступа к этой почте?]()",
  "Login.ResetPassword.Title": "Сброс пароля",
  "Login.ResetPassword.Subtitle": "Введите код, который мы отправили\nна вашу почту **%s**.",
  "Login.ResetPassword.Cancel": "Отмена",
  "Login.ResetPassword.NoEmailText": "При настройке пароля вы не указали резервную почту. Сейчас остаётся вспомнить пароль или сбросить аккаунт.",
  "Login.ResetPassword.TroubleEmailText": "Если восстановить доступ к почте не удаётся, остаётся вспомнить пароль или сбросить аккаунт.",
  "Login.ResetPassword.ResetAccount": "Сбросить аккаунт",
  "Login.ResetAccount.Title": "Предупреждение",
  "Login.ResetAccount.Text": "Это действие нельзя отменить.\n\nПри сбросе аккаунта все сообщения и чаты будут удалены.",
  "Login.ResetAccountFail.Title": "Не удалось выполнить действие",
  "Login.ResetAccountFail.TextCancelled": "Активный пользователь отменил недавнюю попытку сброса аккаунта. Повторите попытку через 7 дней.",
  "Login.ResetAccountFail.TextWait": "Так как аккаунт активен и защищён паролем, из соображений безопасности он будет удалён через неделю.\n\nВы можете отменить это действие в любое время.\n\nДо сброса аккаунта осталось: %s.",
  "Login.ResetEmail.Title": "Сброс почты",
  "Login.ResetEmail.Text": "Вы можете изменить почту для входа, если вошли в VOLTRA с другого устройства.\n\nЕсли доступа к этой почте нет, её можно сбросить с помощью SMS-кода в **%s**.",
  "Login.ResetEmail.Pending": "Почта будет сброшена через %s. [Сбросить сейчас по SMS]()",
  "Login.ResetEmail.PleaseWait": "Сбрасываем почту, подождите...",
  "Login.ResetEmail.NeedPremium": "Требуется VOLTRA Premium",
  "Login.ResetEmail.NeedPremiumText": "Из-за высокой стоимости SMS в вашей стране для немедленного сброса почты по SMS требуется подписка **VOLTRA Premium**.\n\nВы можете попросить друга подарить вам подписку.",
  "Login.Passkey": "Войти с помощью ключа доступа >",
  "Login.Passkey.Error": "Что-то пошло не так",
  "Login.Passkey.Error.NotFound": "Этот ключ доступа не привязан ни к одному аккаунту",
  "Code": "Код",
  "LoginPassword": "Пароль",
  "YourName": "Ваше имя",
  "FirstName": "Имя (обязательно)",
  "LastName": "Фамилия (необязательно)",
  "StartMessaging": "Начать общение",
  "Country": "Страна",
  "Contacts.PhoneNumber.Placeholder": "Номер телефона",
  "Login.Next": "Далее",
  "Login.ContinueOnLanguage": "Продолжить на русском",
  "Login.QR.Title": "Вход по QR-коду",
  "Login.QR.Help1": "Откройте подключённый клиент VOLTRA на телефоне",
  "Login.QR.Help2": "Перейдите в **Настройки** > **Устройства** > **Добавить устройство**",
  "Login.QR.Help3": "Наведите камеру телефона на этот экран, чтобы подтвердить вход",
  "Login.QR.Cancel": "Войти по номеру телефона >",
  "Login.QR.Login": "Войти по QR-коду >",
  "Login.QR.Subtitle": "Отсканируйте код подключённым клиентом VOLTRA на телефоне",
  "PhoneNumber.Code.Fragment.Info": "Получите код в разделе «Номера» на [Fragment](%1$@)",
  "PHONE_CODE_INVALID": "Неверный код",
  "PHONE_CODE_EXPIRED": "Срок действия кода истёк",
  "PASSWORD_HASH_INVALID": "Неверный пароль"
};
for(const [key, value] of Object.entries(signInTranslations)) {
  signInText = replaceObjectValue(signInText, key, value);
}
fs.writeFileSync(path.join(root, 'src/langSign.ts'), signInText, 'utf8');

// The upstream client keeps visible product names in its local language sources,
// separate from the brand constants above. Patch both default and packaged strings.
for(const file of ['src/lang.ts', 'src/langSign.ts']) {
  const filePath = path.join(root, file);
  const source = fs.readFileSync(filePath, 'utf8');
  fs.writeFileSync(filePath, rebrandObjectValues(source), 'utf8');
}

{
  const filePath = path.join(root, 'src/scripts/out/langPack.strings');
  const source = fs.readFileSync(filePath, 'utf8');
  const branded = source.replace(/(=\s*)"((?:\\.|[^"\\])*)"/g, (_match, prefix, value) => prefix + '"' + rebrandVisibleText(value) + '"');
  fs.writeFileSync(filePath, branded, 'utf8');
}

const serviceMessagePatch = "    if(isMessage && message.fromId.isUser() && message.fromId.toUserId() === 777000) {\n      // Translate known server-authored service notifications on the client.\n      message.message = message.message\n        .replace('Login code:', 'Код входа:')\n        .replace('Do not give this code to anyone, even if they say they are from Telesrv!', 'Никому не сообщайте этот код, даже если вам говорят, что они из VOLTRA!')\n        .replace('This code can be used to log in to your Telesrv account. We never ask it for anything else.', 'Этот код используется для входа в ваш аккаунт VOLTRA. Мы никогда не просим его для других целей.')\n        .replace(\"If you didn't request this code by trying to log in on another device, simply ignore this message.\", 'Если вы не запрашивали код для входа с другого устройства, просто проигнорируйте это сообщение.')\n        .replace('👋 Welcome to Telesrv!', '👋 Добро пожаловать в VOLTRA!')\n        .replace('A new sign-in to your account was just completed using your phone number.', 'В ваш аккаунт только что выполнили вход по номеру телефона.')\n        .replace(\"If this was you, no action is needed. If it wasn't, please revoke this session immediately from Settings → Privacy and Security → Active Sessions.\", 'Если это были вы, ничего делать не нужно. Если нет, немедленно завершите этот сеанс в разделе «Настройки» → «Конфиденциальность и безопасность» → «Активные сеансы».')\n        .replaceAll('Telesrv', 'VOLTRA')\n        .replaceAll('Telegram', 'VOLTRA');\n    }\n\n";
replaceOnce('src/lib/appManagers/appMessagesManager.ts', "    if(isMessage && message.message.length && !message.totalEntities) {", serviceMessagePatch + "    if(isMessage && message.message.length && !message.totalEntities) {", 'Translate VOLTRA service notifications');

const runtimeHelper = "  function rebrandVisibleText(value: string): string {\n    const urls: string[] = [];\n    let text = value.replace(/https?:\\/\\/[^\\s)\\]]+/gi, (url) => {\n      const marker = '__VOLTRA_EXTERNAL_URL_' + urls.length + '__';\n      urls.push(url);\n      return marker;\n    });\n    text = text.replace(/\\bTelesrv\\b/gi, 'VOLTRA')\n      .replace(/\\bTelegram\\s+Premium\\b/gi, 'VOLTRA Premium')\n      .replace(/\\bTelegram\\b/gi, 'VOLTRA')\n      .replace(/телеграмм?/gi, 'VOLTRA');\n    return text.replace(/__VOLTRA_EXTERNAL_URL_(\\d+)__/g, (_match, index) => urls[Number(index)]);\n  }";
const runtimeHelperWithOverrides = "  const VOLTRA_RU_OVERRIDES: Record<string, string> = " + JSON.stringify({"Settings":"Настройки","Language":"Язык","Language.ru":"Русский","AccountSettings.Language":"Язык","AccountSettings.Notifications":"Уведомления и звуки","AccountSettings.PrivacyAndSecurity":"Конфиденциальность и безопасность","AccountSettings.Filters":"Папки с чатами","AccountSettings.SpeakersAndCamera":"Динамики и камера","DataSettings":"Данные и память","PrivacySettings":"Конфиденциальность и безопасность","PrivacyTitle":"Конфиденциальность","Peer.ServiceNotifications":"Сервисные уведомления","TranslateMessages":"Перевод сообщений","ShowTranslateButton":"Показывать кнопку «Перевести»","ShowTranslateChatButton":"Переводить целые чаты","DoNotTranslate":"Не переводить","Translation.DoNotShow":"Не показывать кнопки «Перевести» для выбранных языков.","Translate":"Перевести","TranslateMessage":"Перевести","TranslateToButton":"Перевести на %s","DoNotTranslateLanguage":"Не переводить %s","Search":"Поиск","SearchPlaceholder":"Поиск...","MyStory":"Моя история","YourStory":"Ваша история","Suggestion.Notifications":"Не пропускайте сообщения! %s","Suggestion.Notifications.Subtitle":"Включите уведомления, чтобы быть в курсе.","Suggestion.Notifications.Dismissed":"Уведомления можно снова включить в настройках.","Notifications":"Уведомления","Notifications.Web":"Уведомления в браузере","Notifications.Show":"Показывать уведомления","Notifications.Enable":"Включить уведомления","Notifications.Offline":"Показывать уведомления офлайн","Notifications.Sound":"Звук уведомлений","Notifications.Sound.Sent":"Сообщение отправлено","Notifications.Sound.Volume":"Громкость звука","Notifications.Sound.Caption":"Перетащите ползунок или нажмите, чтобы проверить громкость.","Notifications.Sound.Section":"Звук","Notifications.Sound.Effects":"Звуковые эффекты","Notifications.Default":"Разрешите VOLTRA отправлять уведомления. Возможно, потребуется обновить страницу.","Notifications.Restricted":"Уведомления запрещены. Измените разрешение в настройках браузера и попробуйте снова.","Profile.Info.User":"Информация о пользователе","Phone":"Телефон","PrivacyPhone":"Номер телефона","Username":"Имя пользователя","AddContact":"Добавить в контакты","AddContactTitle":"Добавить контакт","BlockUser":"Заблокировать пользователя","Unblock":"Разблокировать","BlockedUsers":"Заблокированные пользователи","Verified.Bot":"Этот бот официально подтверждён представителями VOLTRA.","Verified.Channel":"Этот канал подтверждён представителями VOLTRA.","Verified.Group":"Эта группа подтверждена представителями VOLTRA.","ChatList.Main.EmptyPlaceholder.Title":"Здесь будут отображаться ваши чаты","ChatList.Main.EmptyPlaceholder.Subtitle":"У вас есть %s в VOLTRA","ChatList.Main.EmptyPlaceholder.SubtitleNoContacts":"Используйте VOLTRA на телефоне, чтобы синхронизировать контакты.","NewPrivateChat":"Новый личный чат","AttachAlbum":"Альбом","Loading":"Загрузка...","General.Keyboard":"Сочетания клавиш","General.SendShortcut.Enter":"Отправлять по клавише Enter","General.SendShortcut.CtrlEnter":"Отправлять по сочетанию %s + Enter","General.SendShortcut.NewLine.ShiftEnter":"Перенос строки по Shift + Enter","General.SendShortcut.NewLine.Enter":"Перенос строки по Enter","Chat.Input.Attach.PhotoOrVideo":"Фото или видео","Chat.Input.Attach.Document":"Файл","Chat.Input.Record.Voice":"Голосовое сообщение","Chat.Input.Record.Video":"Видеосообщение","Chat.Subscribe":"ПОДПИСАТЬСЯ","EditProfile.FirstNameLabel":"Имя","EditProfile.BioLabel":"О себе (необязательно)","EditProfile.Username.Label":"Имя пользователя (необязательно)","EditProfile.Username.Available":"Имя пользователя доступно","EditProfile.Username.Taken":"Имя пользователя уже занято","EditProfile.Username.Invalid":"Некорректное имя пользователя","NewChannel":"Новый канал","NewGroup":"Новая группа","Contacts":"Контакты","SavedMessages":"Избранное","SettingsHelp":"Помощь","General":"Основные","TextSize":"Размер текста сообщений","ChatBackground":"Обои чата","EnableAnimations":"Включить анимацию","AutoDownloadMedia":"Автозагрузка медиа","AutodownloadContacts":"Контакты","AutodownloadPrivateChats":"Личные чаты","AutodownloadGroupChats":"Группы","AutodownloadChannels":"Каналы","AutoplayGIF":"GIF-анимации","AutoplayVideo":"Видео","NotificationsForGroups":"Уведомления в группах","NotificationsForPrivateChats":"Уведомления в личных чатах","NotificationsForChannels":"Уведомления в каналах","MarkAsUnread":"Отметить как непрочитанное","MarkAsRead":"Отметить как прочитанное","MarkAllAsRead":"Отметить все как прочитанные","TwoStepVerification":"Двухэтапная аутентификация","PrivacyLastSeen":"Последний визит и статус «в сети»","PrivacyPhoneTitle":"Кто видит мой номер телефона?","PrivacyPhoneTitle2":"Кто может найти меня по номеру телефона?","SessionsTitle":"Активные сеансы","AreYouSureSessionsTitle":"Завершить сеансы","AreYouSureSessions":"Вы уверены, что хотите завершить все остальные сеансы?","Terminate":"Завершить","WhoCanCallMe":"Кто может мне звонить?","WhoCanAddMe":"Кто может добавлять меня?","ArchivedChats":"Архив","Cancel":"Отмена","Confirm":"Подтвердить","Decline":"Отклонить","Allow":"Разрешить","Archive":"В архив","Unarchive":"Вернуть из архива","Delete":"Удалить","Reply":"Ответить","Edit":"Изменить","Forward":"Переслать","CopyLink":"Копировать ссылку","Copy":"Копировать","LinkCopied":"Ссылка скопирована","GroupAddMembers":"Добавить участников","SendMessageTo":"Добавить людей...","Message":"Сообщение","Caption":"Подпись","Poll":"Опрос","SharedFilesTab2":"Файлы","SharedMediaTab2":"Медиа","SharedLinksTab2":"Ссылки","SharedMusicTab2":"Музыка","SharedVoiceTab2":"Голосовые","NewPoll":"Новый опрос","PollOptions":"Настройки опроса","AskAQuestion":"Задать вопрос","UserBio":"О себе","AreYouSureDeleteContact":"Вы уверены, что хотите удалить этот контакт?","DeleteContact":"Удалить контакт","HistoryCleared":"История очищена","LogOut":"Выйти","FirstName":"Имя (обязательно)","LastName":"Фамилия (необязательно)","UserBlocked":"Пользователь заблокирован","UserUnblocked":"Пользователь разблокирован","PrivacyProfilePhoto":"Фото профиля","PrivacyProfilePhotoTitle":"Кто может видеть моё фото профиля?","GroupsAndChannelsHelp":"Настройте, кто может добавлять вас в группы и каналы.","SessionsInfo":"Управляйте сеансами на всех своих устройствах.","AutomaticMediaDownload":"Автоматическая загрузка медиа","AutoDownloadPhotos":"Фотографии","AutoDownloadVideos":"Видео","AutoDownloadFiles":"Файлы","UsernameAlso":"ещё %1$s","Online":"в сети","BusinessHoursProfile":"Часы работы","BusinessHoursProfileOpen":"открыто круглосуточно","BusinessHoursProfileFullOpen":"открыто 24/7","BusinessHoursProfileClose":"закрыто","BusinessHoursProfileNowOpen":"Открыто","BusinessHoursProfileNowClosed":"Закрыто","BusinessProfileLocation":"Адрес","BusinessHoursCopied":"Часы работы скопированы","BusinessLocationCopied":"Адрес скопирован","UserBio":"О себе","Phone":"Телефон","Message.Unsupported.Desktop":"Это сообщение пока не поддерживается в VOLTRA Web.","Message.Unsupported.Mobile":"Это сообщение пока не поддерживается в VOLTRA Web."}) + ";\n" + runtimeHelper;
replaceOnce('src/lib/langPack.ts', '  export const countriesList: HelpCountry[] = [];', '  export const countriesList: HelpCountry[] = [];\n' + runtimeHelperWithOverrides, 'Add VOLTRA branding and Russian overrides to runtime language packs');
// Render the actual first frame of animated gift documents in profile grids.
// The upstream grid requested thumbnails only; some gift documents have no usable
// static thumb, which left an empty tile. Other sticker surfaces keep their defaults.
replaceOnce(
  'src/components/emoticonsDropdown/tabs/SuperStickerRenderer.ts',
  '    middleware?: Middleware\\n  ) {',
  '    middleware?: Middleware,\\n    onlyThumbOverride?: boolean\\n  ) {',
  'Allow gift grids to render animated documents'
);
replaceOnce(
  'src/components/emoticonsDropdown/tabs/SuperStickerRenderer.ts',
  '      onlyThumb: doc.animated,',
  '      onlyThumb: onlyThumbOverride ?? doc.animated,',
  'Use full sticker rendering when requested by gift grids'
);
replaceOnce(
  'src/components/stargifts/stargiftsGrid.tsx',
  '    props.renderer.renderSticker(props.item.sticker, stickerRef);',
  '    props.renderer.renderSticker(props.item.sticker, stickerRef, undefined, undefined, false);',
  'Render profile and market gift sticker frames even without static thumbnails'
);

replaceOnce('src/lib/appManagers/appUsersManager.ts', "    user.pFlags ??= {};\n\n    if(user.pFlags.min && oldUser !== undefined) {", "    if(user._ === 'user' && user.id === 777000) {\n      // Rebrand the built-in service account in the UI without changing its server-side username.\n      user.first_name = 'VOLTRA';\n      user.last_name = '';\n      delete user.photo;\n    }\n\n    user.pFlags ??= {};\n\n    if(user.pFlags.min && oldUser !== undefined) {", 'Rebrand system service account name');

const runtimeLoop = "    for(const original of langPack.strings) {\n      const string: any = {...original};\n      for(const key of ['value', 'zero_value', 'one_value', 'two_value', 'few_value', 'many_value', 'other_value']) {\n        if(typeof string[key] === 'string') string[key] = rebrandVisibleText(string[key]);\n      }\n      if(langPack.lang_code === 'ru' && string._ === 'langPackString' && VOLTRA_RU_OVERRIDES[string.key]) {\n        string.value = VOLTRA_RU_OVERRIDES[string.key];\n      }\n      strings.set(string.key as LangPackKey, string);\n    }";
replaceOnce('src/lib/langPack.ts', "    for(const string of langPack.strings) {\n      strings.set(string.key as LangPackKey, string);\n    }", runtimeLoop, 'Rebrand Russian and cached language-pack strings');


// The pinned upstream SignInCard already contains the sequential DC pre-warm cascade.
// Keep it intact; the timeout below prevents the login button from spinning forever.

replaceOnce(
  'src/pages/cards/SignInCard.tsx',
  "          const dcId = _dcs.shift();",
  "          if(submitting()) {\n            setTimeout(g, 1000);\n            return;\n          }\n\n          const dcId = _dcs.shift();",
  'Pause DC pre-warming while login is active'
);

// Do not leave the login button spinning forever if a transport response is lost.
replaceOnce(
  'src/pages/cards/SignInCard.tsx',
  "    managers.apiManager.invokeApi('auth.sendCode', {",
  "    const sendCodeRequest = managers.apiManager.invokeApi('auth.sendCode', {",
  'Create explicit sendCode request'
);
replaceOnce(
  'src/pages/cards/SignInCard.tsx',
  "    }).then(async(code) => {",
  "    });\n    let sendCodeTimeout: number;\n    const sendCodeWithTimeout = new Promise<any>((resolve, reject) => {\n      sendCodeTimeout = window.setTimeout(() => reject({type: 'NETWORK_TIMEOUT'}), 25000);\n      sendCodeRequest.then(resolve, reject);\n    });\n    sendCodeWithTimeout.then(async(code) => {\n      window.clearTimeout(sendCodeTimeout);",
  'Add bounded auth.sendCode wait'
);
replaceOnce(
  'src/pages/cards/SignInCard.tsx',
  "    }).catch((err) => {\n      setSubmitting(false);",
  "    }).catch((err) => {\n      window.clearTimeout(sendCodeTimeout);\n      setSubmitting(false);",
  'Always clear auth timeout on error'
);
replaceOnce(
  'src/pages/cards/SignInCard.tsx',
  "          setNextContent(err.type);",
  "          setNextContent(err.type === 'NETWORK_TIMEOUT' ? 'Сервер не ответил за 25 секунд. Проверьте соединение и повторите попытку.' : (err.type || 'Ошибка соединения'));",
  'Show readable login timeout'
);

replaceOnce("index.html", "<html lang=\"en\">", "<html lang=\"ru\">", "Set HTML lang to ru");
for(const file of ['public/site.webmanifest', 'public/site_apple.webmanifest']) {
  const filePath = path.join(root, file);
  const source = fs.readFileSync(filePath, 'utf8');
  const branded = source.replace(/Telesrv Web K/g, 'VOLTRA Web')
    .replace(/Telesrv K/g, 'VOLTRA')
    .replace(/A private, self-hosted messaging client for telesrv\./g, 'Частный мессенджер VOLTRA.');
  fs.writeFileSync(filePath, branded, 'utf8');
}

// Replace the inherited T-shaped sign-in mark with a simple VOLTRA V mark.
const oldLogo = `<g id="telesrv-logo">
          <rect x="8" y="8" width="144" height="144" rx="40" fill="#6558E8"/>
          <path d="M44 57h68c9 0 16 7 16 16s-7 16-16 16H87c-10 0-18 8-18 18v25" fill="none" stroke="#FFF" stroke-width="16" stroke-linecap="round" stroke-linejoin="round"/>
          <path d="M43 87h27" fill="none" stroke="#FFF" stroke-width="16" stroke-linecap="round"/>
          <circle cx="42" cy="87" r="12" fill="#27C7A5" stroke="#FFF" stroke-width="5"/>
        </g>`;
const newLogo = `<g id="telesrv-logo">
          <rect x="8" y="8" width="144" height="144" rx="40" fill="#6558E8"/>
          <path d="M43 43L80 123L117 43" fill="none" stroke="#FFF" stroke-width="17" stroke-linecap="round" stroke-linejoin="round"/>
          <path d="M93 31L74 76H91L67 130" fill="none" stroke="#27C7A5" stroke-width="9" stroke-linecap="round" stroke-linejoin="round"/>
        </g>`;
replaceOnce('index.html', oldLogo, newLogo, 'VOLTRA sign-in logo');
replaceOnce(
  'src/config/app.ts',
  "interclientBroadcastChannel: 'telesrv-web'",
  "interclientBroadcastChannel: 'voltra-web'",
  'VOLTRA browser broadcast channel'
);

replaceOnce(
  'vite.config.ts',
  '    sourcemap: true,',
  '    sourcemap: false,',
  'Disable production source maps for the constrained static-host build'
);

console.log('VOLTRA RSA, transport, and branding patches applied.');
