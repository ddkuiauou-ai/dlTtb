const activePreviewIds = new Set<string>();

export type PreviewActivationListener = (ids: ReadonlySet<string>) => void;

const listeners = new Set<PreviewActivationListener>();

function emit() {
  const snapshot = new Set(activePreviewIds);
  for (const listener of listeners) {
    try {
      listener(snapshot);
    } catch {
      // Ignore listener errors so one subscriber cannot break others.
    }
  }
}

export function markPreviewActive(id: string | null | undefined) {
  if (!id) return;
  if (activePreviewIds.has(id)) return;
  activePreviewIds.add(id);
  emit();
}

export function markPreviewInactive(id: string | null | undefined) {
  if (!id) return;
  if (!activePreviewIds.delete(id)) return;
  emit();
}

export function getActivePreviewIdsSnapshot(): ReadonlySet<string> {
  return new Set(activePreviewIds);
}

export function subscribeToPreviewActivations(listener: PreviewActivationListener) {
  listeners.add(listener);
  try {
    listener(new Set(activePreviewIds));
  } catch {
    // Ignore listener errors during initial notification.
  }
  return () => {
    listeners.delete(listener);
  };
}
