// File: android-app/SmsBroadcastReceiver.java | Version: 1.0.0 | Date: 2026-11-01
// گیرندهٔ پیامک در پس‌زمینه (جایگزین بررسی دوره‌ای). برگرفته از مستند تیم فنی (کلاس ۲) با دو تفاوت حریم خصوصی:
//  ۱) فقط پیامک فرستنده‌هایی که کاربر تأیید کرده بررسی می‌شود؛ ۲) متن پیامک هیچ‌جا ذخیره نمی‌شود،
//  فقط یک اعلان خصوصی نمایش داده می‌شود و تحلیل واقعی هنگام باز شدن برنامه انجام می‌گیرد.
package com.deforbest.employeedesk;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.provider.Telephony;
import android.telephony.SmsMessage;
import android.util.Log;

import org.json.JSONArray;

import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

public class SmsBroadcastReceiver extends BroadcastReceiver {

    private static final String TAG = "SmsReceiver";
    public static final String ALLOWED_SENDERS_KEY = "allowed_senders_json";
    private static final int NOTIF_ID = 7001;
    private static final ExecutorService EXECUTOR = Executors.newSingleThreadExecutor();

    @Override
    public void onReceive(Context context, Intent intent) {
        if (intent == null || !Telephony.Sms.Intents.SMS_RECEIVED_ACTION.equals(intent.getAction())) {
            return;
        }

        final PendingResult pendingResult = goAsync();
        final Context appContext = context.getApplicationContext();

        SmsMessage[] messages = Telephony.Sms.Intents.getMessagesFromIntent(intent);
        if (messages == null || messages.length == 0) {
            pendingResult.finish();
            return;
        }

        StringBuilder fullBody = new StringBuilder();
        String sender = messages[0].getOriginatingAddress();
        for (SmsMessage msg : messages) {
            if (msg != null && msg.getMessageBody() != null) {
                fullBody.append(msg.getMessageBody());
            }
        }
        final String rawText = fullBody.toString();
        final String finalSender = sender != null ? sender : "UNKNOWN";

        EXECUTOR.execute(() -> {
            try {
                // پیش‌فیلتر رمز یک‌بارمصرف در لایهٔ بومی
                if (isOtpMessage(rawText)) {
                    Log.d(TAG, "Ignored OTP/Security SMS in native layer.");
                    return;
                }
                SharedPreferences securePrefs = SecureStorageAndNotificationHelper.getEncryptedStorage(appContext);
                JSONArray allowed = new JSONArray(securePrefs.getString(ALLOWED_SENDERS_KEY, "[]"));
                String norm = SecureStorageAndNotificationHelper.normalizeSender(finalSender);
                boolean ok = false;
                for (int i = 0; i < allowed.length() && !ok; i++) {
                    ok = norm.length() > 0 && norm.equals(SecureStorageAndNotificationHelper.normalizeSender(allowed.optString(i)));
                }
                if (!ok) return; // فرستندهٔ تأییدنشده: نه ذخیره، نه اعلان
                SecureStorageAndNotificationHelper.showPrivateFinancialNotification(
                        appContext, NOTIF_ID, "میز کار هوشمند",
                        "یک پیامک بانکی تازه رسید. برای ثبت تراکنش، برنامه را باز کنید.");
            } catch (Exception e) {
                Log.e(TAG, "Error handling incoming bank SMS", e);
            } finally {
                pendingResult.finish();
            }
        });
    }

    private boolean isOtpMessage(String text) {
        if (text == null) return true;
        String normalized = text.replace("ي", "ی").replace("ك", "ک").toLowerCase();
        return normalized.contains("رمز پویا") ||
               normalized.contains("رمز دوم") ||
               normalized.contains("رمز یکبار مصرف") ||
               normalized.contains("رمز یک بار مصرف") ||
               normalized.contains("کد تایید") ||
               normalized.contains("کد ورود") ||
               normalized.contains("کد امنیتی") ||
               normalized.contains("otp") ||
               normalized.contains("verification");
    }
}
