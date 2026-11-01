// File: android-app/SecureStorageAndNotificationHelper.java | Version: 1.0.0 | Date: 2026-11-01
// ذخیره‌سازی رمزنگاری‌شده (با خودترمیمی Keystore) و اعلان خصوصی با آیکون «عدد روز» شمسی.
// برگرفته از مستند تیم فنی (کلاس ۱)، با تطبیق نام بسته و افزودن: آیکون عدد روز، باز شدن برنامه با لمس اعلان.
package com.deforbest.employeedesk;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.graphics.Bitmap;
import android.graphics.Canvas;
import android.graphics.Color;
import android.graphics.Paint;
import android.graphics.Rect;
import android.graphics.Typeface;
import android.os.Build;
import android.util.Log;

import androidx.core.app.NotificationCompat;
import androidx.core.graphics.drawable.IconCompat;
import androidx.security.crypto.EncryptedSharedPreferences;
import androidx.security.crypto.MasterKey;

import java.io.IOException;
import java.security.GeneralSecurityException;
import java.security.KeyStore;
import java.util.Calendar;

public class SecureStorageAndNotificationHelper {

    private static final String TAG = "SmartWorkspaceSec";
    private static final String ENCRYPTED_PREFS_NAME = "smart_workspace_secure_vault";
    private static final String CHANNEL_ID = "financial_and_shift_alerts";

    public static synchronized SharedPreferences getEncryptedStorage(Context context)
            throws GeneralSecurityException, IOException {
        try {
            return createEncryptedPrefs(context);
        } catch (Exception e) {
            // خودترمیمی در برابر خرابی Keystore در بعضی گوشی‌ها (مثلاً پس از تغییر قفل صفحه)
            Log.e(TAG, "Keystore corrupted, resetting encrypted preferences vault", e);
            context.deleteSharedPreferences(ENCRYPTED_PREFS_NAME);
            try {
                KeyStore keyStore = KeyStore.getInstance("AndroidKeyStore");
                keyStore.load(null);
                keyStore.deleteEntry(MasterKey.DEFAULT_MASTER_KEY_ALIAS);
            } catch (Exception ksEx) {
                Log.e(TAG, "Failed to delete corrupted MasterKey entry", ksEx);
            }
            return createEncryptedPrefs(context);
        }
    }

    private static SharedPreferences createEncryptedPrefs(Context context)
            throws GeneralSecurityException, IOException {
        MasterKey masterKey = new MasterKey.Builder(context)
                .setKeyScheme(MasterKey.KeyScheme.AES256_GCM)
                .build();
        return EncryptedSharedPreferences.create(
                context,
                ENCRYPTED_PREFS_NAME,
                masterKey,
                EncryptedSharedPreferences.PrefKeyEncryptionScheme.AES256_SIV,
                EncryptedSharedPreferences.PrefValueEncryptionScheme.AES256_GCM
        );
    }

    /** شمارهٔ ایران با پیش‌شماره‌های مختلف را یکسان می‌کند؛ نام‌های حرفی فقط به حروف کوچک تبدیل می‌شوند. */
    public static String normalizeSender(String raw) {
        if (raw == null) return "";
        String s = raw.trim().toLowerCase().replaceAll("[\\s\\-()]", "");
        if (s.matches("^\\+?[0-9]+$")) {
            if (s.startsWith("+98")) s = s.substring(3);
            else if (s.startsWith("0098")) s = s.substring(4);
            else if (s.startsWith("98") && s.length() > 8) s = s.substring(2);
            if (s.startsWith("+")) s = s.substring(1);
            while (s.startsWith("0")) s = s.substring(1);
        }
        return s;
    }

    /** روز ماه شمسی امروز (۱ تا ۳۱) بر پایهٔ ساعت دستگاه */
    public static int todayJalaliDay() {
        Calendar c = Calendar.getInstance();
        return gregorianToJalali(c.get(Calendar.YEAR), c.get(Calendar.MONTH) + 1, c.get(Calendar.DAY_OF_MONTH))[2];
    }

    public static int[] gregorianToJalali(int gy, int gm, int gd) {
        int[] gdm = {0, 31, 59, 90, 120, 151, 181, 212, 243, 273, 304, 334};
        int gy2 = (gm > 2) ? (gy + 1) : gy;
        int days = 355666 + (365 * gy) + ((gy2 + 3) / 4) - ((gy2 + 99) / 100) + ((gy2 + 399) / 400) + gd + gdm[gm - 1];
        int jy = -1595 + (33 * (days / 12053));
        days %= 12053;
        jy += 4 * (days / 1461);
        days %= 1461;
        if (days > 365) {
            jy += (days - 1) / 365;
            days = (days - 1) % 365;
        }
        int jm, jd;
        if (days < 186) {
            jm = 1 + (days / 31);
            jd = 1 + (days % 31);
        } else {
            jm = 7 + ((days - 186) / 30);
            jd = 1 + ((days - 186) % 30);
        }
        return new int[]{jy, jm, jd};
    }

    /** آیکون نوار وضعیت: عدد روز ماه شمسی (سفید روی زمینهٔ شفاف؛ سیستم‌عامل رنگ را خودش تعیین می‌کند) */
    public static IconCompat buildDayIcon(Context context) {
        int day = todayJalaliDay();
        float density = context.getResources().getDisplayMetrics().density;
        int size = Math.max(48, Math.min(Math.round(24 * density), 128));
        Bitmap bmp = Bitmap.createBitmap(size, size, Bitmap.Config.ARGB_8888);
        Canvas canvas = new Canvas(bmp);
        Paint p = new Paint(Paint.ANTI_ALIAS_FLAG);
        p.setColor(Color.WHITE);
        p.setTextAlign(Paint.Align.CENTER);
        p.setTypeface(Typeface.DEFAULT_BOLD);

        String latin = String.valueOf(day);
        StringBuilder fa = new StringBuilder();
        for (char ch : latin.toCharArray()) fa.append((char) ('۰' + (ch - '0')));
        String text = fa.toString();
        p.setTextSize(size);
        if (!p.hasGlyph(text)) text = latin; // اگر قلم گوشی ارقام فارسی نداشت، ارقام لاتین

        float textSize = size * (text.length() > 1 ? 0.8f : 0.95f);
        p.setTextSize(textSize);
        float w = p.measureText(text);
        float maxW = size * 0.94f;
        if (w > maxW) {
            textSize = textSize * maxW / w;
            p.setTextSize(textSize);
        }
        Rect b = new Rect();
        p.getTextBounds(text, 0, text.length(), b);
        float y = size / 2f - b.exactCenterY();
        canvas.drawText(text, size / 2f, y, p);
        return IconCompat.createWithBitmap(bmp);
    }

    public static void showPrivateFinancialNotification(
            Context context, int notificationId, String title, String sensitiveBody) {
        NotificationManager manager = (NotificationManager) context.getSystemService(Context.NOTIFICATION_SERVICE);
        if (manager == null) return;

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            NotificationChannel channel = new NotificationChannel(
                    CHANNEL_ID,
                    "یادآورها و تراکنش‌های مالی",
                    NotificationManager.IMPORTANCE_HIGH
            );
            channel.setLockscreenVisibility(Notification.VISIBILITY_PRIVATE);
            manager.createNotificationChannel(channel);
        }

        IconCompat dayIcon = buildDayIcon(context);

        // لمس اعلان، برنامه را باز می‌کند
        Intent open = new Intent(context, MainActivity.class);
        open.setFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP | Intent.FLAG_ACTIVITY_CLEAR_TOP);
        int piFlags = PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE;
        PendingIntent pi = PendingIntent.getActivity(context, notificationId, open, piFlags);

        Notification publicLockScreenVersion = new NotificationCompat.Builder(context, CHANNEL_ID)
                .setSmallIcon(dayIcon)
                .setContentTitle("میز کار هوشمند")
                .setContentText("یک اعلان جدید ثبت شد (برای مشاهده قفل صفحه را باز کنید)")
                .build();

        Notification privateNotification = new NotificationCompat.Builder(context, CHANNEL_ID)
                .setSmallIcon(dayIcon)
                .setContentTitle(title)
                .setContentText(sensitiveBody)
                .setStyle(new NotificationCompat.BigTextStyle().bigText(sensitiveBody))
                .setVisibility(NotificationCompat.VISIBILITY_PRIVATE)
                .setPublicVersion(publicLockScreenVersion)
                .setPriority(NotificationCompat.PRIORITY_HIGH)
                .setAutoCancel(true)
                .setContentIntent(pi)
                .build();

        manager.notify(notificationId, privateNotification);
    }
}
