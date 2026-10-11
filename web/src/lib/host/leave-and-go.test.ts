import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  HOST_LEAVE_FALLBACK_MS,
  HOST_LEAVE_GHOST_MS,
  createHostLeaveController,
} from './leave-and-go';

describe('createHostLeaveController', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('navigates immediately when the room cannot be closed over WS', () => {
    const navigate = vi.fn();
    const ctl = createHostLeaveController(navigate, { ghostMs: 0 });
    ctl.leave('/quizzes', null);
    expect(navigate).toHaveBeenCalledTimes(1);
    expect(navigate).toHaveBeenCalledWith('/quizzes');
  });

  it('navigates once when close ack arrives, ignoring the fallback timer', () => {
    vi.useFakeTimers();
    const navigate = vi.fn();
    const ctl = createHostLeaveController(navigate, { ghostMs: 0 });
    let done: (() => void) | undefined;
    ctl.leave('/quizzes', (go) => {
      done = go;
    });
    done?.();
    expect(navigate).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(HOST_LEAVE_FALLBACK_MS);
    expect(navigate).toHaveBeenCalledTimes(1);
  });

  it('falls back to navigate if close ack never arrives', () => {
    vi.useFakeTimers();
    const navigate = vi.fn();
    const ctl = createHostLeaveController(navigate, { ghostMs: 0 });
    ctl.leave('/quizzes', () => {});
    expect(navigate).not.toHaveBeenCalled();
    vi.advanceTimersByTime(HOST_LEAVE_FALLBACK_MS);
    expect(navigate).toHaveBeenCalledWith('/quizzes');
  });

  it('does not navigate after cancel — leftover timer from a previous leave', () => {
    vi.useFakeTimers();
    const navigate = vi.fn();
    const ctl = createHostLeaveController(navigate, { ghostMs: 0 });
    let done: (() => void) | undefined;
    ctl.leave('/quizzes', (go) => {
      done = go;
    });
    ctl.cancel();
    done?.();
    vi.advanceTimersByTime(HOST_LEAVE_FALLBACK_MS);
    expect(navigate).not.toHaveBeenCalled();
  });

  it('ignores clicks during the ghost window after mount', () => {
    let now = 1_000;
    const navigate = vi.fn();
    const ctl = createHostLeaveController(navigate, {
      ghostMs: HOST_LEAVE_GHOST_MS,
      now: () => now,
    });
    ctl.leave('/quizzes', null);
    expect(navigate).not.toHaveBeenCalled();
    now += HOST_LEAVE_GHOST_MS;
    ctl.leave('/quizzes', null);
    expect(navigate).toHaveBeenCalledWith('/quizzes');
  });
});
