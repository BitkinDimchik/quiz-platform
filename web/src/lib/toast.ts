type Listener = (msg: string) => void;
const listeners = new Set<Listener>();

export function toast(msg: string) {
  listeners.forEach((fn) => fn(msg));
}

export function onToast(fn: Listener): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}
