package __PACKAGE__;

import android.app.Activity;
import android.app.Application;
import android.os.Bundle;

public final class GlyphyApplication extends Application implements Application.ActivityLifecycleCallbacks {
    private int startedActivities;

    @Override
    public void onCreate() {
        super.onCreate();
        registerActivityLifecycleCallbacks(this);
    }

    @Override
    public void onActivityStarted(Activity activity) {
        if (startedActivities++ == 0) IconScheduler.opened(this);
    }

    @Override
    public void onActivityStopped(Activity activity) {
        if (--startedActivities == 0) IconScheduler.closed(this);
    }

    @Override public void onActivityCreated(Activity activity, Bundle state) {}
    @Override public void onActivityResumed(Activity activity) {}
    @Override public void onActivityPaused(Activity activity) {}
    @Override public void onActivitySaveInstanceState(Activity activity, Bundle state) {}
    @Override public void onActivityDestroyed(Activity activity) {}
}
