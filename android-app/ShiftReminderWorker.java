// File: android-app/ShiftReminderWorker.java | Version: 1.0.0 | Date: 2026-11-01
// زمان‌بند بومی یادآورها با WorkManager (کار می‌کند حتی وقتی برنامه بسته است).
// برگرفته از مستند تیم فنی (کلاس ۳) با افزودن کلید یادآور برای جلوگیری از اعلان تکراری.
package com.deforbest.employeedesk;

import android.content.Context;
import android.content.SharedPreferences;

import androidx.annotation.NonNull;
import androidx.work.Data;
import androidx.work.ExistingWorkPolicy;
import androidx.work.OneTimeWorkRequest;
import androidx.work.WorkManager;
import androidx.work.Worker;
import androidx.work.WorkerParameters;

import java.util.HashSet;
import java.util.Set;
import java.util.concurrent.TimeUnit;

public class ShiftReminderWorker extends Worker {

    public static final String KEY_TITLE = "reminder_title";
    public static final String KEY_BODY = "reminder_body";
    public static final String KEY_NOTIF_ID = "reminder_notif_id";
    public static final String KEY_REMINDER = "reminder_key";
    public static final String TAG_ALL = "emp_rem";
    public static final String PREFS = "emp_native_reminders";
    public static final String FIRED_SET = "fired_keys";

    public ShiftReminderWorker(@NonNull Context context, @NonNull WorkerParameters params) {
        super(context, params);
    }

    @NonNull
    @Override
    public Result doWork() {
        String title = getInputData().getString(KEY_TITLE);
        String body = getInputData().getString(KEY_BODY);
        String key = getInputData().getString(KEY_REMINDER);
        int notifId = getInputData().getInt(KEY_NOTIF_ID, (int) (System.currentTimeMillis() % 100000));

        if (title != null && body != null) {
            SecureStorageAndNotificationHelper.showPrivateFinancialNotification(
                    getApplicationContext(), notifId, title, body
            );
            if (key != null) {
                SharedPreferences sp = getApplicationContext().getSharedPreferences(PREFS, Context.MODE_PRIVATE);
                synchronized (ShiftReminderWorker.class) {
                    Set<String> s = new HashSet<>(sp.getStringSet(FIRED_SET, new HashSet<String>()));
                    s.add(key);
                    sp.edit().putStringSet(FIRED_SET, s).apply();
                }
            }
        }
        return Result.success();
    }

    public static String workName(String key) {
        return "emp_rem_" + Integer.toHexString(key.hashCode());
    }

    public static void scheduleReminder(Context context, long delayMillis, int notifId, String title, String body, String key) {
        Data input = new Data.Builder()
                .putString(KEY_TITLE, title)
                .putString(KEY_BODY, body)
                .putInt(KEY_NOTIF_ID, notifId)
                .putString(KEY_REMINDER, key)
                .build();

        OneTimeWorkRequest request = new OneTimeWorkRequest.Builder(ShiftReminderWorker.class)
                .setInitialDelay(Math.max(0, delayMillis), TimeUnit.MILLISECONDS)
                .setInputData(input)
                .addTag(TAG_ALL)
                .build();

        WorkManager.getInstance(context).enqueueUniqueWork(workName(key), ExistingWorkPolicy.REPLACE, request);
    }
}
