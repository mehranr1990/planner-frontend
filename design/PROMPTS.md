# راهنمای استفاده + پرامپت‌ها (فاز Personal)

## راه‌اندازی (یک بار)
1. این پوشه را داخل ریپو با اسم `design/` کپی کن (اگر نسخه‌ی قبلی هست، کامل جایگزینش کن).
2. `design/CLAUDE.md` را به ریشه‌ی ریپو هم کپی کن (Claude Code خودکار می‌خواند).
3. مشخصات کامل همه‌ی صفحه‌ها در `design/PERSONAL.md` است.
4. دیدن بُردها: `npx serve design/boards` — یا عکس‌های `design/screenshots` (برای تب‌های مهم عکس جدا با `__` در اسم هست).

## پرامپت شروع (اگر از قبل پروژه شروع شده)
```
Read CLAUDE.md and design/PERSONAL.md (P00CardsTabs, P00PersonalIA, P99Handoff sections first).
The design package was updated: the final Personal boards (P01–P18, PM01–PM04) supersede S1–S14 and Mobile*.
Compare what already exists in the repo with the new rules (card geometry, tab families, rail groups, routes,
no Assistant) and give me a short list of what must change. Do not change code yet. Then stop.
```

## پرامپت‌ها (هر بار فقط یکی؛ بعد از تأیید برو بعدی)

### مرحله ۱ — توکن‌ها و تم
```
Do Step 1 from CLAUDE.md §7. Build /styleguide in light/dark × LTR/RTL with digits ۱۲۳/123,
Toman/Rial and Jalali examples. Screenshot all 4 combinations, show me, then stop.
```

### مرحله ۲ — کامپوننت‌های پایه
```
Do Step 2 from CLAUDE.md §7. References: screenshots/P00CardsTabs*.jpg, Utility.png, Cards.png.
Start with SignatureCard (clip-path, action or empty corner, RTL) and FolderTabsCard (top + bottom-even,
merged 20px fillets). Add everything to /styleguide, screenshot, compare, fix, then stop.
```

### مرحله ۳ — پوسته و مسیرها
```
Do Step 3 from CLAUDE.md §7. Use the Routes table in PERSONAL.md (P00PersonalIA) for all Personal routes
(placeholder pages are fine). Rail = 3 groups + Settings; mobile bottom nav + More sheet; hidden-module logic
from Settings (mock). Screenshot desktop 1440/1024 and mobile 390, LTR and RTL. Then stop.
```

### مرحله ۴ تا ۶ — هر صفحه یک بار
```
Build <P02 My Day> from design/boards/P02MyDay.dc.html.
Spec: the "P02 · My Day" section of design/PERSONAL.md (all States, Rules, Motion).
Screenshots: screenshots/P02MyDay.jpg (+ P02MyDayDark.jpg, mobile in PM01MobileCore.jpg).
Use the board data as typed mock fixtures behind the API client. Reuse components; add new ones to /styleguide.
Implement every listed state (empty, loading, error, selected…). Screenshot next to the reference,
list differences, fix, then stop.
```
ترتیب:
P02 My Day → P03 Tasks List → P03 Tasks Board → P06 Task Detail → P05 Task Create + Quick Add → P04 Calendar → P01 Overview →
P07 Inbox → P08 Brain Dump → P09 Focus/Break → P10 Shutdown → P18 sheets →
P11 Goals → P12 Habits → P13 Finance → P14 Journal → P15 Insights → P16 Weekly Review → P17 Settings

### برای صفحه‌هایی که نمودار دارند (قبل از آن صفحه)
```
Build the <Goal Milestone Path> component from design/boards/DataVizAdd.dc.html
(and DataVizAddDark for dark). Follow its spec exactly: states, selected node, tooltip, empty/sparse,
RTL rule, motion. Add it to /styleguide with all states, screenshot, compare, then stop.
```
نمودارها: Goal Milestone Path و Budget Flow و Layered Area (DataVizAdd) · Mood Terrain و Focus Clock و Carry-over Flow (DataVizRefine) · Budget River و Context Ribbon و Weekly Story و Habit Field (DataVizPersonal) · Habit Streak Ribbon (HabitStreakRibbon)

### مرحله ۸ — موبایل و فارسی
```
Do Step 8 from CLAUDE.md §7. Compare every screen at 390px with PM01–PM03 and in Persian RTL with PM04
(rules in the PM04 section of PERSONAL.md). Screenshot each, list differences, fix, stop.
```

### مرحله ۹ — تم تیره
```
Do Step 9 from CLAUDE.md §7. Compare every screen in dark with its *Dark screenshot. Volt #B4F58C only
for live state, deep cards #173A31, text on accents uses --on-accent, WCAG AA. Fix, then stop.
```

## نکته‌ها
- تصمیم‌های باز (تب Open decisions در P99Handoff) هنوز قطعی نیستند؛ اگر Claude Code به یکی رسید، پیش‌فرضِ نوشته‌شده را بگذارد و در گزارش بگوید.
- اگر جایی شبیه طراحی نشد: عکس بُرد و عکس خروجی را کنار هم بده و بگو «این دو را مقایسه کن و تفاوت‌ها را درست کن».
- Offline sync و AI در این فاز ساخته نمی‌شوند؛ فقط لایه‌ی داده آماده‌ی offline باشد.
- وقتی IRANSans را خریدی، فقط `--font-fa` در tokens.css را عوض کن.
