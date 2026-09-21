/** An error whose message is safe and useful to show in the interface. */
export class PublicError extends Error {
  constructor(
    message: string,
    readonly status = 400,
  ) {
    super(message);
    this.name = "PublicError";
  }
}

export function publicError(message: string, status = 400): PublicError {
  return new PublicError(message, status);
}
