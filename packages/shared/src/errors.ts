export class DomainError extends Error {
  constructor(message: string, readonly code: string, options?: ErrorOptions) {
    super(message, options);
    this.name = 'DomainError';
  }
}

export class AuthorizationError extends DomainError {
  constructor(message = 'Authorization denied') {
    super(message, 'AUTHORIZATION_DENIED');
    this.name = 'AuthorizationError';
  }
}

export class ConflictError extends DomainError {
  constructor(message: string) {
    super(message, 'CONFLICT');
    this.name = 'ConflictError';
  }
}

export class ValidationError extends DomainError {
  constructor(message: string) {
    super(message, 'VALIDATION_ERROR');
    this.name = 'ValidationError';
  }
}
