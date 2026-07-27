package com.teacherworkbench.app;

import android.content.pm.ActivityInfo;
import android.content.res.Configuration;
import android.graphics.Color;
import android.os.Bundle;
import android.view.View;
import android.view.Window;
import android.webkit.WebView;
import androidx.core.view.WindowCompat;
import androidx.core.view.WindowInsetsControllerCompat;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
  private static final int STATUS_BAR_LIGHT = Color.parseColor("#F2F2F4");

  @Override
  public void onCreate(Bundle savedInstanceState) {
    setRequestedOrientation(ActivityInfo.SCREEN_ORIENTATION_PORTRAIT);
    registerPlugin(SeatOrientationPlugin.class);
    super.onCreate(savedInstanceState);
    applyInitialStatusBarAppearance();
  }

  @Override
  public void onStart() {
    super.onStart();
    configureWebViewTouchAndHaptics();
    applyInitialStatusBarAppearance();
  }

  @Override
  public void onConfigurationChanged(Configuration newConfig) {
    super.onConfigurationChanged(newConfig);
    applyInitialStatusBarAppearance();
  }

  private void applyInitialStatusBarAppearance() {
    Window window = getWindow();
    if (window == null) return;

    WindowCompat.setDecorFitsSystemWindows(window, true);
    window.setStatusBarColor(STATUS_BAR_LIGHT);
    window.setNavigationBarColor(STATUS_BAR_LIGHT);

    View decor = window.getDecorView();
    WindowInsetsControllerCompat controller = WindowCompat.getInsetsController(window, decor);
    if (controller != null) {
      // true => dark status/navigation icons on a light background
      controller.setAppearanceLightStatusBars(true);
      controller.setAppearanceLightNavigationBars(true);
    }
  }

  private void configureWebViewTouchAndHaptics() {
    if (getBridge() == null) return;
    WebView webView = getBridge().getWebView();
    if (webView == null) return;

    // Keep pointer gestures in the Web layer; avoid Android overscroll rubber-banding.
    webView.setOverScrollMode(View.OVER_SCROLL_NEVER);
    webView.setNestedScrollingEnabled(false);
    webView.setHapticFeedbackEnabled(false);
    webView.setLongClickable(false);
    webView.setOnLongClickListener(view -> true);

    // Disable framework default haptic feedback so only JS/Capacitor Haptics fires.
    View root = findViewById(android.R.id.content);
    if (root != null) {
      root.setHapticFeedbackEnabled(false);
      disableHapticFeedbackRecursive(root);
    }
  }

  private void disableHapticFeedbackRecursive(View view) {
    view.setHapticFeedbackEnabled(false);
    if (view instanceof android.view.ViewGroup) {
      android.view.ViewGroup group = (android.view.ViewGroup) view;
      for (int index = 0; index < group.getChildCount(); index += 1) {
        disableHapticFeedbackRecursive(group.getChildAt(index));
      }
    }
  }
}
