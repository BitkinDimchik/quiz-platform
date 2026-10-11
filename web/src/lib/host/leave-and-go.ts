/** Fallback if the host_close_room ack never arrives. */
export const HOST_LEAVE_FALLBACK_MS = 1700;
/** Ignore retargeted clicks right after the host screen mounts. */
export const HOST_LEAVE_GHOST_MS = 400;

export type HostLeaveClose = (done: () => void) => void;

export function createHostLeaveController(
  navigate: (path: string) => void,
  options?: {
    fallbackMs?: number;
    ghostMs?: number;
    now?: () => number;
  },
) {
  const fallbackMs = options?.fallbackMs ?? HOST_LEAVE_FALLBACK_MS;
  const ghostMs = options?.ghostMs ?? HOST_LEAVE_GHOST_MS;
  const now = options?.now ?? Date.now;
  let gen = 0;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const mountedAt = now();

  const clearTimer = () => {
    if (timer === undefined) return;
    clearTimeout(timer);
    timer = undefined;
  };

  const cancel = () => {
    gen += 1;
    clearTimer();
  };

  const leave = (path: string, close: HostLeaveClose | null) => {
    if (now() - mountedAt < ghostMs) return;
    const token = ++gen;
    clearTimer();
    const go = () => {
      if (token !== gen) return;
      gen += 1;
      clearTimer();
      navigate(path);
    };
    if (!close) {
      go();
      return;
    }
    close(go);
    timer = setTimeout(go, fallbackMs);
  };

  return { leave, cancel };
}
