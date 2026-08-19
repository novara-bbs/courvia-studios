/** Raised by adapters for port methods their stage does not implement yet. */
export class NotImplementedError extends Error {
  constructor(operation: string, stage: string) {
    super(`${operation} is not implemented in this adapter stage (${stage})`);
    this.name = "NotImplementedError";
  }
}
