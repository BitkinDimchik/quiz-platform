export class DomainError extends Error {
  constructor(
    message: string,
    readonly code:
      | 'NOT_FOUND'
      | 'CONFLICT'
      | 'VALIDATION'
      | 'UNAUTHORIZED'
      | 'FORBIDDEN'
      | 'ILLEGAL_STATE'
      | 'INTERNAL' = 'INTERNAL',
  ) {
    super(message);
    this.name = 'DomainError';
  }

  static notFound(what: string): DomainError {
    return new DomainError(`not found: ${what}`, 'NOT_FOUND');
  }

  static conflict(what: string): DomainError {
    return new DomainError(`conflict: ${what}`, 'CONFLICT');
  }

  static validation(detail: string): DomainError {
    return new DomainError(detail, 'VALIDATION');
  }

  static unauthorized(detail: string): DomainError {
    return new DomainError(detail, 'UNAUTHORIZED');
  }

  static forbidden(detail: string): DomainError {
    return new DomainError(detail, 'FORBIDDEN');
  }

  static illegalState(detail: string): DomainError {
    return new DomainError(detail, 'ILLEGAL_STATE');
  }
}
