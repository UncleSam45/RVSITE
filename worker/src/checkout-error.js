export function checkoutError(message, status = 400) {
  const error = new Error(message);
  error.publicMessage = message;
  error.status = status;
  return error;
}
