// File: android-app/SmsReaderPlugin.java | Version: 2.0.0 | Date: 2026-11-01
// خواندن پیامک (فقط با اجازهٔ کاربر)، خواندن کلیپ‌بورد و اعلان بومی اندروید.
// متدهای قبلی (read, checkPermissions, requestPermissions) بدون تغییر کار می‌کنند.
package com.deforbest.employeedesk;

import android.Manifest;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.ClipData;
import android.content.ClipboardManager;
import android.content.Context;
import android.content.Intent;
import android.database.Cursor;
import android.net.Uri;
import android.os.Build;

import androidx.core.app.NotificationCompat;

import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.PermissionState;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.annotation.Permission;
import com.getcapacitor.annotation.PermissionCallback;

import org.json.JSONException;

import java.util.ArrayList;
import java.util.HashSet;
import java.util.List;
import java.util.Set;

@CapacitorPlugin(
    name = "SmsReader",
    permissions = {
        @Permission(alias = "sms", strings = { Manifest.permission.READ_SMS }),
        @Permission(alias = "notifications", strings = { "android.permission.POST_NOTIFICATIONS" })
    }
)
public class SmsReaderPlugin extends Plugin {

    private static final String CHANNEL_ID = "emp_desk_alerts";
    private static final String CHANNEL_NAME = "اعلان‌های میز کار";

    @Override
    public void load() {
        createNotificationChannel();
    }

    private void createNotificationChannel() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            NotificationChannel ch = new NotificationChannel(CHANNEL_ID, CHANNEL_NAME, NotificationManager.IMPORTANCE_HIGH);
            ch.setDescription("یادآورها و اعلان‌های برنامه");
            NotificationManager nm = getContext().getSystemService(NotificationManager.class);
            if (nm != null) nm.createNotificationChannel(ch);
        }
    }

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

    /** شمارهٔ ایران با پیش‌شماره‌های مختلف را یکسان می‌کند؛ نام‌های حرفی فقط به حروف کوچک تبدیل می‌شوند. */
    private static String normalizeSender(String raw) {
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

    private void doRead(PluginCall call) {
        long since = 0L;
        Long s = call.getLong("since");
        if (s != null) since = s;

        int limit = 300;
        Integer l = call.getInt("limit");
        if (l != null) limit = Math.max(1, Math.min(l, 1000));

        // فرستنده‌های مجاز: فقط برابری دقیق (پس از یکسان‌سازی)، نه شباهت. اگر خالی باشد همه (برای شناسایی فرستنده‌ها).
        Set<String> allowed = new HashSet<>();
        JSArray addrs = call.getArray("addresses");
        if (addrs != null) {
            try {
                int n = Math.min(addrs.length(), 50);
                for (int i = 0; i < n; i++) {
                    String a = normalizeSender(addrs.getString(i));
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
                    if (filter && !allowed.contains(normalizeSender(address))) continue;
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
            createNotificationChannel();
            String title = call.getString("title", "میز کار");
            String body = call.getString("body", "");
            int id = (int) (System.currentTimeMillis() & 0xFFFFFF);

            Intent intent = new Intent(getContext(), MainActivity.class);
            intent.setFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP | Intent.FLAG_ACTIVITY_CLEAR_TOP);
            int flags = PendingIntent.FLAG_UPDATE_CURRENT;
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) flags |= PendingIntent.FLAG_IMMUTABLE;
            PendingIntent pi = PendingIntent.getActivity(getContext(), id, intent, flags);

            int icon = getContext().getApplicationInfo().icon;
            if (icon == 0) icon = android.R.drawable.ic_dialog_info;

            NotificationCompat.Builder b = new NotificationCompat.Builder(getContext(), CHANNEL_ID)
                .setSmallIcon(icon)
                .setContentTitle(title)
                .setContentText(body)
                .setStyle(new NotificationCompat.BigTextStyle().bigText(body))
                .setPriority(NotificationCompat.PRIORITY_HIGH)
                .setAutoCancel(true)
                .setContentIntent(pi);

            NotificationManager nm = (NotificationManager) getContext().getSystemService(Context.NOTIFICATION_SERVICE);
            if (nm != null) nm.notify(id, b.build());

            JSObject ret = new JSObject();
            ret.put("ok", true);
            call.resolve(ret);
        } catch (Exception e) {
            call.reject("notify_failed");
        }
    }
}
