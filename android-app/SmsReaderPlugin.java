// File: android-app/SmsReaderPlugin.java | Version: 2.1.0 | Date: 2026-11-01
// پل بین برنامه و اندروید: خواندن پیامک (فقط با اجازهٔ کاربر)، کلیپ‌بورد، اعلان خصوصی با آیکون عدد روز،
// زمان‌بند بومی یادآورها و همگام‌سازی فرستنده‌های مجاز برای گیرندهٔ پس‌زمینه.
package com.deforbest.employeedesk;

import android.Manifest;
import android.content.ClipData;
import android.content.ClipboardManager;
import android.content.Context;
import android.content.SharedPreferences;
import android.database.Cursor;
import android.net.Uri;
import android.os.Build;

import androidx.work.WorkManager;

import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.PermissionState;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.annotation.Permission;
import com.getcapacitor.annotation.PermissionCallback;

import org.json.JSONArray;
import org.json.JSONException;
import org.json.JSONObject;

import java.util.HashSet;
import java.util.Set;

@CapacitorPlugin(
    name = "SmsReader",
    permissions = {
        @Permission(alias = "sms", strings = { Manifest.permission.READ_SMS, Manifest.permission.RECEIVE_SMS }),
        @Permission(alias = "notifications", strings = { "android.permission.POST_NOTIFICATIONS" })
    }
)
public class SmsReaderPlugin extends Plugin {

    /** متنی که از اشتراک‌گذاری گوشی رسیده (توسط MainActivity پر می‌شود) */
    public static volatile String sharedText = null;

    /* ---------------- خواندن پیامک ---------------- */

    @PluginMethod
    public void read(PluginCall call) {
        if (getPermissionState("sms") != PermissionState.GRANTED) {
            requestPermissionForAlias("sms", call, "smsPermsCallback");
            return;
        }
        doRead(call);
    }

    @PermissionCallback
    private void smsPermsCallback(PluginCall call) {
        if (getPermissionState("sms") == PermissionState.GRANTED) doRead(call);
        else call.reject("permission_denied");
    }

    private void doRead(PluginCall call) {
        long since = 0L;
        Long s = call.getLong("since");
        if (s != null) since = s;

        int limit = 300;
        Integer l = call.getInt("limit");
        if (l != null) limit = Math.max(1, Math.min(l, 1000));

        // فرستنده‌های مجاز: فقط برابری دقیق (پس از یکسان‌سازی)، نه شباهت. اگر فهرست خالی باشد همه (فقط برای شناسایی فرستنده‌ها).
        Set<String> allowed = new HashSet<>();
        JSArray addrs = call.getArray("addresses");
        if (addrs != null) {
            try {
                int n = Math.min(addrs.length(), 50);
                for (int i = 0; i < n; i++) {
                    String a = SecureStorageAndNotificationHelper.normalizeSender(addrs.getString(i));
                    if (!a.isEmpty()) allowed.add(a);
                }
            } catch (JSONException e) {
                call.reject("bad_addresses");
                return;
            }
        }
        boolean filter = addrs != null && addrs.length() > 0;

        JSArray out = new JSArray();
        Cursor c = null;
        try {
            c = getContext().getContentResolver().query(
                Uri.parse("content://sms/inbox"),
                new String[] { "address", "body", "date" },
                "date > ?",
                new String[] { String.valueOf(since) },
                "date DESC"
            );
            int count = 0;
            if (c != null) {
                while (count < limit && c.moveToNext()) {
                    String address = c.getString(0);
                    if (filter && !allowed.contains(SecureStorageAndNotificationHelper.normalizeSender(address))) continue;
                    JSObject o = new JSObject();
                    o.put("address", address);
                    o.put("body", c.getString(1));
                    o.put("date", c.getLong(2));
                    out.put(o);
                    count++;
                }
            }
        } catch (Exception e) {
            call.reject("read_failed");
            return;
        } finally {
            if (c != null) c.close();
        }

        JSObject ret = new JSObject();
        ret.put("messages", out);
        call.resolve(ret);
    }

    /** فرستنده‌های تأییدشده را برای گیرندهٔ پس‌زمینه در حافظهٔ رمزنگاری‌شده نگه می‌دارد (فهرست خالی = هیچ پیامکی بررسی نشود) */
    @PluginMethod
    public void setSenders(PluginCall call) {
        try {
            JSArray arr = call.getArray("senders");
            JSONArray clean = new JSONArray();
            if (arr != null) {
                int n = Math.min(arr.length(), 50);
                for (int i = 0; i < n; i++) {
                    String v = arr.getString(i);
                    if (v != null && v.trim().length() > 0 && v.length() <= 40) clean.put(v.trim());
                }
            }
            SharedPreferences sp = SecureStorageAndNotificationHelper.getEncryptedStorage(getContext());
            sp.edit().putString(SmsBroadcastReceiver.ALLOWED_SENDERS_KEY, clean.toString()).apply();
            JSObject ret = new JSObject();
            ret.put("ok", true);
            call.resolve(ret);
        } catch (Exception e) {
            call.reject("set_senders_failed");
        }
    }

    /* ---------------- متن اشتراک‌گذاری‌شده ---------------- */

    @PluginMethod
    public void getSharedText(PluginCall call) {
        String t = sharedText;
        sharedText = null;
        JSObject ret = new JSObject();
        ret.put("text", t == null ? "" : t);
        call.resolve(ret);
    }

    /* ---------------- کلیپ‌بورد ---------------- */

    @PluginMethod
    public void readClipboard(final PluginCall call) {
        if (getActivity() == null) { call.reject("inactive"); return; }
        getActivity().runOnUiThread(new Runnable() {
            @Override
            public void run() {
                try {
                    ClipboardManager cm = (ClipboardManager) getContext().getSystemService(Context.CLIPBOARD_SERVICE);
                    String text = "";
                    if (cm != null && cm.hasPrimaryClip()) {
                        ClipData clip = cm.getPrimaryClip();
                        if (clip != null && clip.getItemCount() > 0) {
                            CharSequence cs = clip.getItemAt(0).coerceToText(getContext());
                            if (cs != null) text = cs.toString();
                        }
                    }
                    JSObject ret = new JSObject();
                    ret.put("text", text);
                    call.resolve(ret);
                } catch (Exception e) {
                    call.reject("clipboard_failed");
                }
            }
        });
    }

    /* ---------------- اعلان بومی ---------------- */

    @PluginMethod
    public void checkNotificationPermission(PluginCall call) {
        JSObject ret = new JSObject();
        if (Build.VERSION.SDK_INT < 33 || getPermissionState("notifications") == PermissionState.GRANTED) {
            ret.put("state", "granted");
        } else {
            ret.put("state", "prompt");
        }
        call.resolve(ret);
    }

    @PluginMethod
    public void requestNotificationPermission(PluginCall call) {
        if (Build.VERSION.SDK_INT < 33 || getPermissionState("notifications") == PermissionState.GRANTED) {
            JSObject ret = new JSObject();
            ret.put("state", "granted");
            call.resolve(ret);
            return;
        }
        requestPermissionForAlias("notifications", call, "notifPermsCallback");
    }

    @PermissionCallback
    private void notifPermsCallback(PluginCall call) {
        JSObject ret = new JSObject();
        ret.put("state", getPermissionState("notifications") == PermissionState.GRANTED ? "granted" : "denied");
        call.resolve(ret);
    }

    @PluginMethod
    public void showNotification(PluginCall call) {
        if (Build.VERSION.SDK_INT >= 33 && getPermissionState("notifications") != PermissionState.GRANTED) {
            call.reject("permission_denied");
            return;
        }
        try {
            String title = call.getString("title", "میز کار");
            String body = call.getString("body", "");
            int id = (int) (System.currentTimeMillis() & 0xFFFFFF);
            SecureStorageAndNotificationHelper.showPrivateFinancialNotification(getContext(), id, title, body);
            JSObject ret = new JSObject();
            ret.put("ok", true);
            call.resolve(ret);
        } catch (Exception e) {
            call.reject("notify_failed");
        }
    }

    /* ---------------- زمان‌بند بومی یادآورها ---------------- */

    /** items: [{key, at(epoch ms), title, body}] — همهٔ یادآورهای قبلی لغو و دوباره زمان‌بندی می‌شوند */
    @PluginMethod
    public void scheduleReminders(PluginCall call) {
        try {
            WorkManager wm = WorkManager.getInstance(getContext());
            wm.cancelAllWorkByTag(ShiftReminderWorker.TAG_ALL);
            JSArray items = call.getArray("items");
            int count = 0;
            if (items != null) {
                long now = System.currentTimeMillis();
                int n = Math.min(items.length(), 60);
                for (int i = 0; i < n; i++) {
                    JSONObject it = items.getJSONObject(i);
                    String key = it.optString("key", "");
                    long at = it.optLong("at", 0L);
                    if (key.isEmpty() || at <= now + 15000L || at > now + 9L * 86400000L) continue;
                    String title = it.optString("title", "میز کار");
                    String body = it.optString("body", "");
                    int notifId = 8000 + (key.hashCode() & 0xFFFF);
                    ShiftReminderWorker.scheduleReminder(getContext(), at - now, notifId, title, body, key);
                    count++;
                }
            }
            JSObject ret = new JSObject();
            ret.put("scheduled", count);
            call.resolve(ret);
        } catch (Exception e) {
            call.reject("schedule_failed");
        }
    }

    @PluginMethod
    public void cancelReminders(PluginCall call) {
        try {
            WorkManager.getInstance(getContext()).cancelAllWorkByTag(ShiftReminderWorker.TAG_ALL);
            JSObject ret = new JSObject();
            ret.put("ok", true);
            call.resolve(ret);
        } catch (Exception e) {
            call.reject("cancel_failed");
        }
    }

    @PluginMethod
    public void cancelReminder(PluginCall call) {
        try {
            String key = call.getString("key", "");
            if (key != null && !key.isEmpty()) {
                WorkManager.getInstance(getContext()).cancelUniqueWork(ShiftReminderWorker.workName(key));
            }
            JSObject ret = new JSObject();
            ret.put("ok", true);
            call.resolve(ret);
        } catch (Exception e) {
            call.reject("cancel_failed");
        }
    }

    /** کلیدهای یادآورهایی که بومی نمایش داده شده‌اند؛ برنامه آن‌ها را «انجام‌شده» ثبت می‌کند تا دوباره اعلام نشوند */
    @PluginMethod
    public void drainFired(PluginCall call) {
        JSArray keys = new JSArray();
        try {
            SharedPreferences sp = getContext().getSharedPreferences(ShiftReminderWorker.PREFS, Context.MODE_PRIVATE);
            Set<String> s;
            synchronized (ShiftReminderWorker.class) {
                s = new HashSet<>(sp.getStringSet(ShiftReminderWorker.FIRED_SET, new HashSet<String>()));
                sp.edit().remove(ShiftReminderWorker.FIRED_SET).apply();
            }
            for (String k : s) keys.put(k);
        } catch (Exception ignored) { }
        JSObject ret = new JSObject();
        ret.put("keys", keys);
        call.resolve(ret);
    }
}
