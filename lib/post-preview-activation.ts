const activatedPreviews = new Set<string>();
const listeners = new Set<() => void>();

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
    notify();
  }
}

export function clearPostPreviewActivation(id: string): void {
  if (!id) return;
  if (activatedPreviews.delete(id)) {
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
  return Array.from(activatedPreviews);
}
