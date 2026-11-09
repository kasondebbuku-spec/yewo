// A broken business rule. The domain layer knows nothing about HTTP;
// app.js turns these into status codes (Protected Variations).
export class DomainError extends Error {
  constructor(kind, message) {
    super(message);
    this.kind = kind; // 'invalid' | 'forbidden' | 'conflict' | 'not_found'
  }
}

export const invalid = (msg) => new DomainError('invalid', msg);
export const notAllowed = (msg = 'Not allowed') => new DomainError('forbidden', msg);
export const clash = (msg) => new DomainError('conflict', msg);
export const missing = (msg = 'Not found') => new DomainError('not_found', msg);
