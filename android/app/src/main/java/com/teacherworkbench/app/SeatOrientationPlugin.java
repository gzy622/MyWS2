package com.teacherworkbench.app;

import android.app.Activity;
import android.content.pm.ActivityInfo;
import android.content.res.Configuration;
import android.os.Handler;
import android.os.Looper;
import android.os.SystemClock;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

@CapacitorPlugin(name = "SeatOrientation")
public class SeatOrientationPlugin extends Plugin {
  private static final long ORIENTATION_TIMEOUT_MS = 2500;
  private static final long ORIENTATION_CHECK_INTERVAL_MS = 50;
  private final Handler mainHandler = new Handler(Looper.getMainLooper());

  @PluginMethod
  public void setLandscape(PluginCall call) {
    requestOrientation(
      call,
      ActivityInfo.SCREEN_ORIENTATION_LANDSCAPE,
      Configuration.ORIENTATION_LANDSCAPE,
      "系统未能切换到横屏"
    );
  }

  @PluginMethod
  public void setPortrait(PluginCall call) {
    requestOrientation(
      call,
      ActivityInfo.SCREEN_ORIENTATION_PORTRAIT,
      Configuration.ORIENTATION_PORTRAIT,
      "系统未能恢复竖屏"
    );
  }

  private void requestOrientation(PluginCall call, int requestedOrientation, int expectedOrientation, String errorMessage) {
    Activity activity = getActivity();
    activity.runOnUiThread(() -> {
      long startedAt = SystemClock.uptimeMillis();
      activity.setRequestedOrientation(requestedOrientation);
      waitForOrientation(call, activity, expectedOrientation, errorMessage, startedAt);
    });
  }

  private void waitForOrientation(
    PluginCall call,
    Activity activity,
    int expectedOrientation,
    String errorMessage,
    long startedAt
  ) {
    if (activity.getResources().getConfiguration().orientation == expectedOrientation) {
      call.resolve();
      return;
    }
    if (SystemClock.uptimeMillis() - startedAt >= ORIENTATION_TIMEOUT_MS) {
      call.reject(errorMessage);
      return;
    }
    mainHandler.postDelayed(
      () -> waitForOrientation(call, activity, expectedOrientation, errorMessage, startedAt),
      ORIENTATION_CHECK_INTERVAL_MS
    );
  }
}
