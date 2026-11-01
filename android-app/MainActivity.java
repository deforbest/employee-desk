// File: android-app/MainActivity.java | Version: 1.1.0 | Date: 2026-11-01
package com.deforbest.employeedesk;

import android.content.Intent;
import android.os.Bundle;

import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(SmsReaderPlugin.class);
        super.onCreate(savedInstanceState);
        stashShared(getIntent());
    }

    @Override
    protected void onNewIntent(Intent intent) {
        super.onNewIntent(intent);
        stashShared(intent);
    }

    // متنی که از «اشتراک‌گذاری» گوشی (مثلاً از برنامهٔ پیامک) به برنامه فرستاده می‌شود
    private void stashShared(Intent intent) {
        try {
            if (intent != null && Intent.ACTION_SEND.equals(intent.getAction()) && "text/plain".equals(intent.getType())) {
                CharSequence t = intent.getCharSequenceExtra(Intent.EXTRA_TEXT);
                if (t != null && t.length() > 0 && t.length() < 20000) SmsReaderPlugin.sharedText = t.toString();
            }
        } catch (Exception ignored) { }
    }
}
