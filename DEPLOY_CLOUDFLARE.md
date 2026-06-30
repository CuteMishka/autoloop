# Деплой Autoloop на Cloudflare Pages + D1

Эта конфигурация оставляет React/Vite фронтенд как статический сайт, а API переносит в Cloudflare Pages Functions:

- `/api/config`
- `/api/auth/*`
- `/api/orders/*`
- `/api/telegram/webhook`
- `/api/payments/freedom/*`
- `/api/dashboard`

Данные хранятся в Cloudflare D1, поэтому Telegram-подтверждения и заказы не пропадают между serverless-запросами.

## 1. Что уже добавлено в проект

- `functions/api/[[path]].js` - Cloudflare Pages Function для всех `/api/*`.
- `migrations/0001_init.sql` - схема D1 и начальные точки аренды.
- `wrangler.toml` - Cloudflare Pages/D1 конфигурация.

Локальный Express-сервер (`npm run dev`) оставлен для разработки.

## 2. Создать D1 базу

Установить/запустить Wrangler через `npx`:

```powershell
npx wrangler login
npx wrangler d1 create autoloop
```

Cloudflare вернет `database_id`. Вставьте его в `wrangler.toml` вместо:

```toml
database_id = "replace-with-cloudflare-d1-database-id"
```

Применить миграцию:

```powershell
npx wrangler d1 migrations apply autoloop --remote
```

Проверить таблицы:

```powershell
npx wrangler d1 execute autoloop --remote --command "SELECT id, name, clean_on_shelf FROM points;"
```

## 3. Создать Cloudflare Pages project

В Cloudflare Dashboard:

1. Workers & Pages -> Create -> Pages.
2. Подключить GitHub repo.
3. Framework preset: `Vite`.
4. Build command:

```text
npm run build
```

5. Build output directory:

```text
dist
```

6. Deploy command:

```text
npm run deploy:cloudflare
```

Не ставьте `npx wrangler deploy` в Cloudflare Pages. Это команда для Workers, она падает с ошибкой `Missing entry-point to Worker script`. Если Cloudflare просит обязательную deploy-команду, используйте `npm run deploy:cloudflare`, он вызывает `npx wrangler pages deploy dist --project-name autoloop`.

7. В Pages project добавить D1 binding:

```text
Binding name: DB
D1 database: autoloop
```

## 4. Environment variables

В Cloudflare Pages -> Settings -> Environment variables добавить:

```env
PUBLIC_SITE_URL=https://YOUR_PROJECT.pages.dev
TELEGRAM_BOT_USERNAME=autoloop_bot
TELEGRAM_DEMO_MODE=false
FREEDOMPAY_API_URL=https://api.freedompay.kz
FREEDOMPAY_TESTING_MODE=true
FREEDOMPAY_DEMO_MODE=true
LEGAL_COMPANY_NAME=ИП ORIGINAL BAR
LEGAL_BIN=980311451341
LEGAL_ADDRESS=Усть-Каменогорск Г.А., Усть-Каменогорск, УЛИЦА 30-Й ГВАРДЕЙСКОЙ ДИВИЗИИ, дом 46, кв/офис 38
LEGAL_PHONE=+77711546680
LEGAL_EMAIL=eshenbaev@gmail.com
LEGAL_BANK_ACCOUNT=KZ71722S000029932182
LEGAL_BANK_NAME=АО "Kaspi Bank"
LEGAL_BANK_BIK=CASPKZKA
LEGAL_BANK_KBE=19
```

Секреты добавить отдельно, не коммитить их в git:

```env
TELEGRAM_BOT_TOKEN=...
TELEGRAM_WEBHOOK_SECRET=...
FREEDOMPAY_MERCHANT_ID=...
FREEDOMPAY_SECRET_KEY=...
```

Для `TELEGRAM_WEBHOOK_SECRET` можно сгенерировать строку:

```powershell
[guid]::NewGuid().ToString("N")
```

CLI-альтернатива для секретов:

```powershell
npx wrangler pages secret put TELEGRAM_BOT_TOKEN --project-name autoloop
npx wrangler pages secret put TELEGRAM_WEBHOOK_SECRET --project-name autoloop
npx wrangler pages secret put FREEDOMPAY_MERCHANT_ID --project-name autoloop
npx wrangler pages secret put FREEDOMPAY_SECRET_KEY --project-name autoloop
```

## 5. Задеплоить

Через Dashboard достаточно push в GitHub.

Для ручного deploy:

```powershell
npm run build
npm run deploy:cloudflare
```

После деплоя проверить:

```powershell
curl.exe https://YOUR_PROJECT.pages.dev/api/config
```

## 6. Подключить Telegram webhook

Лучше перевыпустить Telegram token в BotFather, если старый токен уже где-то светился.

Поставить webhook:

```powershell
curl.exe -X POST "https://api.telegram.org/bot<TELEGRAM_BOT_TOKEN>/setWebhook" `
  -H "Content-Type: application/json" `
  -d "{\"url\":\"https://YOUR_PROJECT.pages.dev/api/telegram/webhook\",\"secret_token\":\"<TELEGRAM_WEBHOOK_SECRET>\",\"allowed_updates\":[\"message\"]}"
```

Проверить webhook:

```powershell
curl.exe "https://api.telegram.org/bot<TELEGRAM_BOT_TOKEN>/getWebhookInfo"
```

Ожидаемый поток:

1. Пользователь вводит телефон на сайте.
2. Сайт показывает код и ссылку `t.me/autoloop_bot?start=<code>`.
3. Бот просит отправить контакт кнопкой Telegram.
4. Cloudflare Function сверяет контакт с номером на сайте.
5. `/api/auth/status/:id` возвращает `verified: true`.

## 7. URL для FreedomPay

Передать менеджеру FreedomPay:

```text
Check URL:   https://YOUR_PROJECT.pages.dev/api/payments/freedom/check
Result URL:  https://YOUR_PROJECT.pages.dev/api/payments/freedom/result
Success URL: https://YOUR_PROJECT.pages.dev/api/payments/freedom/success
Failure URL: https://YOUR_PROJECT.pages.dev/api/payments/freedom/failure
```

После тестовых оплат и одобрения:

```env
FREEDOMPAY_TESTING_MODE=false
FREEDOMPAY_DEMO_MODE=false
```

## 8. Бесплатный домен

Для теста можно использовать:

```text
https://YOUR_PROJECT.pages.dev
```

Для комплаенса банка лучше нормальный домен:

- GitHub Student Developer Pack domain
- `eu.org` subdomain
- любой недорогой домен, подключенный к Cloudflare Pages

Если FreedomPay согласует `pages.dev`, технически дополнительных доменов не нужно.
