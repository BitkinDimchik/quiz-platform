import { OptimisticLockVersionMismatchError } from 'typeorm';

export function isOptimisticLockVersionMismatchError(e: unknown): boolean {
  return e instanceof OptimisticLockVersionMismatchError;
}
