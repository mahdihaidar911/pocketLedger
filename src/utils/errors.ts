// Expected user-correctable conditions belong in an alert, not the dev error overlay.
export class ValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ValidationError';
  }
}

export function logUnexpectedError(context: string, error: unknown): void {
  if (!(error instanceof ValidationError)) {
    console.error(context, error);
  }
}
