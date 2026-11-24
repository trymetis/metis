export function chatErrorText(error: Error): string {
  try {
    const body: unknown = JSON.parse(error.message);
    if (body && typeof body === "object" && "error" in body && typeof body.error === "string") {
      return body.error;
    }
  } catch {}
  return error.message;
}
