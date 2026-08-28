# Ручные тест-кейсы BestAirbnb

Документ предназначен для проверки live-потока через реальные Google Sheet,
Gmail, Calendar и OpenRouter. Тестовые письма отправляй из отдельного QA-
аккаунта в отдельный непроизводственный mailbox. Не используй клиентские данные.

## Подготовка

1. Перейди в каталог проекта:

   ```bash
   cd /home/vovanezha/work/accelerator-mini/bestairbnb-take-home
   ```

2. Проверь приватный `.env`, не отправляя его содержимое в чат:

   - `PROVIDER_MODE=live`;
   - настроены `DATABASE_URL`, `DIRECT_URL`, `JWT_SECRET`;
   - заполнены Google Sheets/Gmail/Calendar и OpenRouter variables;
   - `INNGEST_DEV=1` для локального Inngest.

3. Если нужна чистая локальная база, выполни destructive reset только после
   проверки, что URL указывает на локальную БД:

   ```bash
   pnpm db:migrate
   RESET_DEMO_CONFIRM=I_UNDERSTAND pnpm reset:demo
   ```

4. Запусти три процесса в отдельных терминалах:

   ```bash
   pnpm dev
   pnpm inngest:dev
   ```

5. В Google Sheet должны быть четыре tabs с первой строкой-заголовком:
   `Properties`, `ServiceZones`, `Services`, `ZoneServices`. Для happy path
   выбери существующую активную property и запомни её точный address/city/postcode,
   активную зону с подходящим postcode prefix и хотя бы один назначенный service.

6. Для кейсов с Gmail draft нужны OAuth scopes для чтения почты и создания/
   обновления drafts. Для каждого письма добавляй уникальный subject с датой,
   чтобы его было легко найти в Gmail query.

## Приоритетный smoke path

Пройди сначала кейсы `TC-00 -> TC-01 -> TC-02 -> TC-04 -> TC-05 -> TC-06 ->
TC-07 -> TC-08 -> TC-09 -> TC-10 -> TC-11 -> TC-12 -> TC-14`.

## Тест-кейсы

### TC-00 — Startup и доступность workflow

**Цель:** убедиться, что приложение и фоновые функции запущены.

1. Открой `http://127.0.0.1:3000/api/health/live`.
2. Открой Inngest dashboard `http://127.0.0.1:8288`.
3. Открой `http://127.0.0.1:3000/login`.

**Ожидаемо:** health отвечает HTTP 200; Inngest видит функции Gmail sync,
master-data sync и lead processing; login page открывается с брендом BestAirbnb.

### TC-01 — Login operations и короткий пароль

**Цель:** проверить, что пароль больше не требует минимальную длину.

> Кейc изменяет локальную БД и поэтому выполняй его только на demo database.

1. Останови Next.js.
2. В приватном `.env` временно задай `OPS_USER_PASSWORD=x`.
3. Выполни `RESET_DEMO_CONFIRM=I_UNDERSTAND pnpm reset:demo`.
4. Запусти `pnpm dev` и открой `/login`.
5. Введи operations email и пароль `x`.
6. Нажми **Continue**.

**Ожидаемо:** login успешен, открывается `/ops`, ошибки о длине пароля нет.
После проверки верни сильный пароль в `.env` и повторно выполни reset.

### TC-02 — Неверный login

1. Выйди из приложения.
2. Введи корректный email и заведомо неверный пароль.
3. Нажми **Continue**.

**Ожидаемо:** остаёшься на login page, видишь понятную ошибку credentials,
токен в приложении не появляется.

### TC-03 — Branding

1. Проверь login page, sidebar после входа, title вкладки и текст email draft.
2. В каталоге проекта выполни:

   ```bash
   rg -n -i "foundency" . --hidden --glob '!.env' --glob '!node_modules/**' --glob '!.next/**'
   ```

**Ожидаемо:** в UI используется только BestAirbnb; команда `rg` не возвращает
совпадений внутри demo project.

### TC-04 — Role access: OPS и MONITOR

1. Войди как OPS и открой `/ops`.
2. Открой `/monitoring`.
3. Выйди и войди как MONITOR.
4. Попробуй открыть `/ops` вручную.
5. На monitoring page проверь наличие mutation controls и lead operation links.

**Ожидаемо:** OPS видит queue и monitoring; MONITOR автоматически остаётся на
`/monitoring`, не получает mutation controls и не может открыть operations queue.

### TC-05 — Успешная синхронизация Google Sheet

1. Войди как OPS и открой `/ops`.
2. Нажми **Sync master data**.
3. Наблюдай состояние **Sheet sync queued...**.
4. Дождись завершения Inngest function.
5. Обнови страницу и проверь блок **Connected sources**.

**Ожидаемо:** появляется время последней успешной синхронизации, текст
**Projection available**, ошибка отсутствует. Сервисы и зоны доступны для
последующего property matching.

### TC-06 — Невалидный Sheet не ломает предыдущую projection

1. Временно добавь в `ZoneServices` строку с несуществующим
   `serviceExternalId`.
2. Нажми **Sync master data**.
3. Дождись завершения run.
4. Проверь `Last run` и текст ошибки.
5. Удали ошибочную строку и повтори sync.

**Ожидаемо:** невалидный run имеет статус FAILED и понятную ошибку; предыдущая
успешная projection остаётся доступной. После исправления Sheet новый run
завершается успешно.

### TC-07 — Новый лид без обязательного адреса: NEEDS INFO

1. Из QA-аккаунта отправь в monitored Gmail mailbox новое письмо, например:

   ```text
   Subject: QA needs-info 2026-08-28-01

   Hello, I need help with my property.
   Name: QA Needs Info
   Email: qa-needs-info@example.test
   I will send the property address later.
   ```

2. В `/ops` нажми **Sync Gmail**.
3. Дождись завершения Gmail sync и всех трёх processing steps.
4. Найди новый lead в queue.
5. Открой lead detail.

**Ожидаемо:** создаётся один lead со статусом `NEEDS INFO`; под badge видна
причина, например `Property address is incomplete`. В detail decision banner
повторяет причину, checklist помечает недостающие поля, showcase actions
disabled и showcase не создаётся.

### TC-08 — Follow-up в том же Gmail thread квалифицирует lead

1. Ответь на письмо из `TC-07` в том же thread.
2. Вставь точный адрес активной property из `Properties`, включая postcode:

   ```text
   Address: <addressLine1>, <city>, <postcode>
   ```

3. Нажми **Sync Gmail** ещё раз.
4. Дождись processing completion.
5. Открой тот же lead.

**Ожидаемо:** новый lead не создаётся; у существующего lead появляется второе
message. После успешного matching status становится `QUALIFIED` (если выбранная
property в активной зоне), checklist заполнен, showcase generation доступен.

### TC-09 — Разные формы ответа OpenRouter

**Цель:** проверить tolerant parsing на реальных моделях.

1. Создай минимум три уникальных письма с одной и той же полной информацией,
   но разной формой текста:
   - поля `Name`, `Email`, `Address` отдельными строками;
   - обычный prose-текст без labels;
   - адрес в другой пунктуации и порядке частей.
2. Обработай их через **Sync Gmail**.
3. Для дополнительной проверки поочерёдно используй основную и fallback-модель
   через `OPENROUTER_MODEL`/`OPENROUTER_FALLBACK_MODELS`, перезапуская Next.js
   после изменения `.env`.
4. У каждого lead открой **Processing timeline**.

**Ожидаемо:** `extract` завершается `SUCCEEDED`, contact email/name/address
заполнены корректно, нет необъяснимого `PROVIDER_INVALID_RESPONSE`. Если модель
вернула нестандартный формат, lead всё равно должен либо корректно извлечься,
либо получить контролируемый processing error с возможностью Retry.

### TC-10 — Ручное исправление адреса и повторная обработка

1. Открой lead со статусом `NEEDS INFO`.
2. В **Property context** замени **Address from lead** на точный адрес из Sheet.
3. При необходимости заполни **City hint**.
4. Нажми **Save & rematch**.
5. Проверь обновлённые normalized fields и candidates.
6. Нажми **Retry processing** и дождись завершения.

**Ожидаемо:** адрес сохраняется, matching candidates пересчитываются; после
retry qualification reason/status пересчитываются, а lead может перейти в
`QUALIFIED`, если обязательная информация и зона корректны.

### TC-11 — Showcase generation и редактирование

1. Открой `QUALIFIED` lead.
2. Нажми **Generate showcase**.
3. Проверь заполнение subject, greeting, property summary, services и
   observations.
4. Измени subject и добавь observation.
5. Нажми **Save showcase**.
6. Обнови страницу.

**Ожидаемо:** showcase получает `READY`, preview показывает актуальный
React Email template; ручные изменения сохраняются после reload. Для
`NEEDS INFO`, `NEEDS REVIEW` и `OUT_OF_ZONE` generation остаётся недоступным.

### TC-12 — Gmail draft и idempotent update

1. На готовом showcase нажми **Save to Gmail**.
2. Открой созданный Gmail draft и запомни draft id/subject.
3. Измени subject в showcase и снова нажми **Save to Gmail**.
4. Открой draft ещё раз.

**Ожидаемо:** draft создаётся с правильным recipient, HTML и subject. Повторная
операция обновляет тот же draft, а не создаёт второй.

### TC-13 — Дубликаты Gmail sync не создают дубликаты лидов

1. Не добавляя новых писем, нажми **Sync Gmail** дважды с завершением каждого
   run.
2. Сравни количество lead и messages до/после.

**Ожидаемо:** существующие Gmail message повторно пропускаются, новые lead не
создаются, queue остаётся без дубликатов.

### TC-14 — Out-of-zone lead

1. Выбери корректный адрес/почтовый индекс, который не попадает ни в один
   активный `ServiceZones` prefix.
2. Отправь письмо с полной contact/address information.
3. Выполни Gmail sync и дождись processing completion.

**Ожидаемо:** lead получает `OUT_OF_ZONE`, reason объясняет, что property вне
известной service zone; showcase не генерируется, lifecycle переводится в
`GONE_COLD`.

### TC-15 — Provider failure и Retry

1. На локальной demo-среде временно задай заведомо невалидный OpenRouter key
   или недоступную модель.
2. Перезапусти Next.js, отправь новое тестовое письмо и выполни Gmail sync.
3. Открой processing timeline.
4. Верни рабочий key/model, перезапусти Next.js и нажми **Retry processing**.

**Ожидаемо:** первая попытка показывает контролируемый provider error без
падения всего приложения; после восстановления lead успешно обрабатывается.

### TC-16 — Monitoring и audit trail

1. После `TC-08`, `TC-11` и изменения lifecycle открой `/monitoring` как OPS.
2. Проверь qualification counts, failed processing, source health, Calendar и
   recent lifecycle activity.
3. Выйди и открой `/monitoring` как MONITOR.

**Ожидаемо:** monitoring отражает актуальные counts и activity; MONITOR видит
данные в read-only режиме, без ссылок/кнопок для изменения lead.

## Как прислать фидбек

Для каждого кейса отправь короткую запись:

```text
TC-07
Статус: PASS / FAIL / BLOCKED
Lead ID: ...
Шаг: ...
Ожидал: ...
Получил: ...
Ошибка/скриншот: ...
```

Если кейс `BLOCKED`, укажи, на каком внешнем ресурсе остановился процесс:
PostgreSQL, Inngest, Google Sheet, Gmail, Calendar или OpenRouter.
