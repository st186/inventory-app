package com.bunnymomos.inventory;

import android.content.pm.PackageManager;
import android.os.Build;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

/**
 * Where this copy of the app was installed from. A copy from the Play Store must be updated
 * through the Play Store (Play policy), so the update banner opens the Play listing instead of
 * offering the APK download (utils/liveUpdate.ts). Live updates of the screens are unaffected.
 */
@CapacitorPlugin(name = "InstallSource")
public class InstallSourcePlugin extends Plugin {

    private static final String PLAY_STORE = "com.android.vending";

    @PluginMethod
    public void get(PluginCall call) {
        String installer = null;
        try {
            PackageManager pm = getContext().getPackageManager();
            String pkg = getContext().getPackageName();
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
                installer = pm.getInstallSourceInfo(pkg).getInstallingPackageName();
            } else {
                installer = pm.getInstallerPackageName(pkg);
            }
        } catch (Exception ignored) {
            // Unknown source: treated as not from the Play Store.
        }
        JSObject ret = new JSObject();
        ret.put("installer", installer);
        ret.put("fromPlay", PLAY_STORE.equals(installer));
        call.resolve(ret);
    }
}
