package __PACKAGE__;

import android.app.AlarmManager;
import android.app.PendingIntent;
import android.content.ComponentName;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.content.pm.PackageManager;

public final class IconScheduler {
    private static boolean foreground;

    private IconScheduler() {}

    private static SharedPreferences preferences(Context context) {
        return context.getSharedPreferences("glyphy_icon_cycle", Context.MODE_PRIVATE);
    }

    public static void opened(Context context) {
        foreground = true;
        rememberVisit(context);
        select(context, IconTimeline.DEFAULT_FRAME);
        schedule(context, IconTimeline.INITIAL_DELAY);
    }

    public static void closed(Context context) {
        foreground = false;
        rememberVisit(context);
        schedule(context, IconTimeline.INITIAL_DELAY);
    }

    private static void rememberVisit(Context context) {
        preferences(context).edit().putLong("last_active", System.currentTimeMillis()).apply();
    }

    public static void refresh(Context context) {
        SharedPreferences prefs = preferences(context);
        long now = System.currentTimeMillis();
        long lastActive = prefs.getLong("last_active", now);
        if (foreground || lastActive > now || !prefs.contains("last_active")) {
            rememberVisit(context);
            lastActive = now;
        }
        long elapsed = now - lastActive;
        select(context, IconTimeline.frame(elapsed));
        schedule(context, IconTimeline.nextDelay(elapsed));
    }

    private static void select(Context context, int frame) {
        PackageManager manager = context.getPackageManager();
        // Enable the replacement first so a launcher entry is always available.
        setEnabled(context, manager, frame, true);
        if (frame != IconTimeline.DEFAULT_FRAME) setEnabled(context, manager, IconTimeline.DEFAULT_FRAME, false);
        for (int other : IconTimeline.INACTIVE_FRAMES) {
            if (other != frame) setEnabled(context, manager, other, false);
        }
    }

    private static void setEnabled(Context context, PackageManager manager, int frame, boolean enabled) {
        ComponentName component = new ComponentName(context, context.getPackageName() + ".LauncherFrame" + frame);
        int desired = enabled ? PackageManager.COMPONENT_ENABLED_STATE_ENABLED : PackageManager.COMPONENT_ENABLED_STATE_DISABLED;
        int current = manager.getComponentEnabledSetting(component);
        boolean currentlyEnabled = current == PackageManager.COMPONENT_ENABLED_STATE_ENABLED
            || current == PackageManager.COMPONENT_ENABLED_STATE_DEFAULT && frame == IconTimeline.DEFAULT_FRAME;
        if (currentlyEnabled != enabled) {
            manager.setComponentEnabledSetting(component, desired, PackageManager.DONT_KILL_APP);
        }
    }

    private static void schedule(Context context, long delay) {
        AlarmManager alarms = (AlarmManager) context.getSystemService(Context.ALARM_SERVICE);
        Intent intent = new Intent(context, IconReceiver.class).setAction(context.getPackageName() + ".ICON_TICK");
        PendingIntent pending = PendingIntent.getBroadcast(context, 45, intent,
            PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
        // Inexact alarms work without a special exact-alarm permission.
        alarms.setAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, System.currentTimeMillis() + delay, pending);
    }
}
