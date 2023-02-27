export class ValidationError extends Error {
  constructor(message) {
    super(message);
    this.name = this.constructor.name;
  }
}

export class PendingMockError extends Error {
  constructor(message) {
    super(message);
    this.name = this.constructor.name;
  }
}
