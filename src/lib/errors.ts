export class AppError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = 'AppError';
  }
}

export const badRequest = (message: string): AppError => new AppError(400, 'BAD_REQUEST', message);
export const unauthorized = (message = 'Unauthorized'): AppError =>
  new AppError(401, 'UNAUTHORIZED', message);
export const notFound = (message = 'Not found'): AppError =>
  new AppError(404, 'NOT_FOUND', message);
export const conflict = (message: string): AppError => new AppError(409, 'CONFLICT', message);
