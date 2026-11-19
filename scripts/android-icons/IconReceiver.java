package __PACKAGE__;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;

public final class IconReceiver extends BroadcastReceiver {
    @Override
    public void onReceive(Context context, Intent intent) {
        IconScheduler.refresh(context);
    }
}
