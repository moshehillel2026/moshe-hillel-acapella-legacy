# פריסה לאוסף המשפחתי

## בחירת אירוח

| אפשרות | התאמה למשפחה |
| --- | --- |
| GitHub Pages | פרסום פרטי של אתר Pages מחייב ארגון ב-GitHub Enterprise Cloud וגישת קריאה למאגר. Pages רגיל מתוך מאגר פרטי אינו פותר את דרישת הגישה למשפחה. אין להפעיל Pages לפרויקט. |
| Cloudflare Pages | הגנת Access המובנית לכתובות Preview אינה מכסה את כתובת הייצור. מדיה מוצבת מאחורי בקרת גישה לכתובת כולה, כולל נתיבי הקבצים. |
| Cloudflare Workers + Access + R2 | אפשרות מוכנה בקוד. אתר סטטי ו-MP3 באותה כתובת HTTPS. Access מאפשר קוד חד-פעמי למיילים מאושרים. הקבצים יושבים ב-R2 פרטי וה-Worker מעביר טווחי בתים עם תשובת `206`. |

המחירים המפורסמים שנבדקו ב-18.11.2026 מחושבים בדולרים. Access במסלול המשפחתי יכול להתאים למכסה החינמית המוצעת לצוותים קטנים. Workers Free מפרסם מכסה של 100,000 בקשות ביום לבקשות Worker. R2 Standard כולל מכסה חודשית חינמית של 10 GB-month אחסון, מיליון פעולות מסוג A ו-10 מיליון מסוג B. מעבר למכסה, המחיר המפורסם הוא 0.015 דולר ל-GB-month,‏ 4.50 דולר למיליון פעולות A ו-0.36 דולר למיליון פעולות B. לפי המחירון, תעבורת יציאה מ-R2 לא מחויבת. שירות אחסון פעיל עשוי לדרוש הפעלת חיוב בחשבון, ויש לבדוק את המכסות והמחירים בחשבון לפני הפעלה. האלבום הנוכחי מכיל כ-36.3 MB של MP3.

מקורות רשמיים: [GitHub Pages פרטי](https://docs.github.com/en/enterprise-cloud@latest/pages/getting-started-with-github-pages/about-privately-published-github-pages-sites), [Cloudflare Pages Preview](https://developers.cloudflare.com/pages/configuration/preview-deployments/), [Access ל-Workers](https://developers.cloudflare.com/workers/configuration/cloudflare-access/), [תמחור Access](https://www.cloudflare.com/sase/products/access/), [תמחור Workers ו-R2](https://developers.cloudflare.com/workers/platform/pricing/), [טווחי בתים ב-R2](https://developers.cloudflare.com/r2/api/workers/workers-api-reference/).

## סדר פריסה לאחר אישור בעל הפרויקט

1. קבלו אישור מפורש לשימוש המשפחתי בשבע ההקלטות ובמילים, ולאירוח בחשבון Cloudflare שנבחר. קבלו את רשימת המיילים המורשים. אם האישור חלקי, הסירו מהקטלוג לייצור ומחבילת ההעלאה את התוכן שמחכה לאישור.
2. צרו דלי R2 מסוג Standard בשם `moshe-hillel-acapella-legacy-private` באותו חשבון. בדקו ש-`r2.dev` כבוי ושאין לדלי דומיין ציבורי. אם השם שונה בחשבון שלכם, עדכנו את `bucket_name` ב-`hosting/wrangler.toml`. בצעו את הפקודות משורש המאגר. נדרש חשבון Cloudflare עם הרשאות Workers,‏ Zero Trust ו-R2.
3. הקימו Worker בלי תוכני הטיוטה, עם קוד ובסיס הקטלוג בלבד:

   ```sh
   mkdir -p .deployment-assets
   cp -R site/. .deployment-assets/
   npx wrangler login
   npx wrangler deploy --config hosting/wrangler.toml
   ```

   בלי הגדרות Access הקוד מחזיר `503` לכל בקשה. בתצורה, `preview_urls` כבוי ו-`run_worker_first` מחיל את בדיקת הגישה גם על נכסי האתר.
4. ב-Cloudflare Zero Trust הפעילו One-time PIN. ב-Workers & Pages בחרו ב-Worker, פתחו **Access** ובחרו **Protect this Worker behind Access → All traffic**. צרו כלל **Allow** לכתובות המדויקות של בני המשפחה בלבד והגדירו One-time PIN כאפשרות ההתחברות. שימרו את ערך ה-Application Audience (AUD) ואת כתובת הצוות `https://TEAM.cloudflareaccess.com` מתוך הגדרות היישום.
5. הגדירו את הערכים בחשבון דרך Wrangler. הזינו את הערכים בשורת הקלט האינטראקטיבית:

   ```sh
   npx wrangler secret put ACCESS_ISSUER --config hosting/wrangler.toml
   npx wrangler secret put ACCESS_AUD --config hosting/wrangler.toml
   ```

   בדפדפן פרטי בדקו שכתובת ה-Worker מבקשת התחברות, שמייל מורשה נפתח אחרי PIN, ושמייל שאינו ברשימת המשפחה חסום. בדקו בקשה ישירה ל-`/songs.json` ול-`/media/yesh-ir.mp3` ללא התחברות. הן צריכות להפנות ל-Access או להחזיר דחייה, גם לפני העלאת האודיו.
6. פרסו את התוכן שאושר בלבד. להלן הפקודות כאשר כל שבעת השירים אושרו:

   ```sh
   for file in draft-input/media/*.mp3; do
     npx wrangler r2 object put "moshe-hillel-acapella-legacy-private/media/${file##*/}" \
       --file "$file" --content-type audio/mpeg --remote || exit
   done
   cp draft-input/songs.json .deployment-assets/songs.json
   npx wrangler deploy --config hosting/wrangler.toml
   ```

   העלו תמונה מאושרת ל-`.deployment-assets/images/` אם נבחר פורטרט, ועדכנו את הקטלוג בהתאם. השאירו את ה-ODT בתיקיית המקור הפרטית.
7. בדקו שוב עם חלון אנונימי ועם משתמש מורשה. בדקו בקשת Range ישירה דרך כלי הרשת בדפדפן בזמן ניגון והזזת הפס. יש לראות `206 Partial Content` ו-`Content-Range` בבקשות Range תקינות. ודאו שהעמוד הראשי אינו מבקש מדיה לפני לחיצה, שכתובות קבצים אינן נגישות ללא Access ושפתיחת האתר בטלפון עובדת בלי חשבון GitHub. רק אחרי הבדיקות מסרו למשפחה את כתובת הייצור האחת.

סטרימינג מצריך חיבור אינטרנט ומשתמש בזיכרון ובמטמון זמני. הגבלת הגישה מגינה על האוסף מפני מבקרים שאינם מורשים. נמען מורשה שהדפדפן שלו קיבל את האודיו יכול לשמור עותק בדרכים שהדפדפן מאפשר.
