export const Haptic = Object.freeze({
  light: 10,
  medium: 10,
});

export function haptic(ms = Haptic.light) {
  const duration = typeof ms === 'number' && ms > 0 ? ms : Haptic.light;
  const Capacitor = globalThis.Capacitor;
  if (Capacitor?.isNativePlatform?.()) {
    const haptics = Capacitor.Plugins?.Haptics;
    if (haptics?.vibrate) {
      Promise.resolve(haptics.vibrate({ duration })).catch(() => {});
      return;
    }
  }

  try {
    navigator.vibrate?.(duration);
  } catch {
    // Vibration may be unavailable or blocked; fail silently.
  }
}
