package com.deforbest.employeedesk;

import android.Manifest;
import android.database.Cursor;
import android.net.Uri;

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

/**
 * Read-only access to the SMS inbox, only after the user grants READ_SMS.
 * Optional filter by sender address. Nothing is stored or sent anywhere by this plugin.
 */
@CapacitorPlugin(
    name = "SmsReader",
    permissions = { @Permission(alias = "sms", strings = { Manifest.permission.READ_SMS }) }
)
public class SmsReaderPlugin extends Plugin {

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
        if (getPermissionState("sms") == PermissionState.GRANTED) {
            doRead(call);
        } else {
            call.reject("permission_denied");
        }
    }

    private void doRead(PluginCall call) {
        long since = 0L;
        Long s = call.getLong("since");
        if (s != null) since = s;

        int limit = 300;
        Integer l = call.getInt("limit");
        if (l != null) limit = Math.max(1, Math.min(l, 1000));

        ArrayList<String> args = new ArrayList<>();
        args.add(String.valueOf(since));
        String where = "date > ?";

        JSArray addrs = call.getArray("addresses");
        if (addrs != null && addrs.length() > 0) {
            StringBuilder in = new StringBuilder();
            try {
                int n = Math.min(addrs.length(), 50);
                for (int i = 0; i < n; i++) {
                    if (i > 0) in.append(",");
                    in.append("?");
                    args.add(addrs.getString(i));
                }
            } catch (JSONException e) {
                call.reject("bad_addresses");
                return;
            }
            where += " AND address IN (" + in.toString() + ")";
        }

        JSArray out = new JSArray();
        Cursor c = null;
        try {
            c = getContext().getContentResolver().query(
                Uri.parse("content://sms/inbox"),
                new String[] { "address", "body", "date" },
                where,
                args.toArray(new String[0]),
                "date DESC LIMIT " + limit
            );
            if (c != null) {
                while (c.moveToNext()) {
                    JSObject o = new JSObject();
                    o.put("address", c.getString(0));
                    o.put("body", c.getString(1));
                    o.put("date", c.getLong(2));
                    out.put(o);
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
}
