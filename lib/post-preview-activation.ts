const activatedPreviews = new Set<string>();
const listeners = new Set<() => void>();
let cachedSnapshot: string[] = [];

function recomputeSnapshot() {
  cachedSnapshot = Array.from(activatedPreviews);
}

recomputeSnapshot();

function notify() {
  for (const listener of listeners) {
    try {
      listener();
    } catch {
      // ignore listener errors to avoid breaking notification chain
    }
  }
}

export function markPostPreviewActivated(id: string): void {
  if (!id) return;
  const prevSize = activatedPreviews.size;
  activatedPreviews.add(id);
  if (activatedPreviews.size !== prevSize) {
    recomputeSnapshot();
    notify();
  }
}

export function clearPostPreviewActivation(id: string): void {
  if (!id) return;
  if (activatedPreviews.delete(id)) {
    recomputeSnapshot();
    notify();
  }
}

export function isPostPreviewActivated(id: string): boolean {
  if (!id) return false;
  return activatedPreviews.has(id);
}

export function subscribeToPreviewActivation(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function getActivatedPreviewSnapshot(): string[] {
  return cachedSnapshot;
}
