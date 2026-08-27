export function publicIpcError(error: unknown, fallback: string): Error {
  const message = error instanceof Error ? error.message : ''
  const cleaned = message
    .replace(/^Error invoking remote method ['"][^'"]+['"]:\s*/iu, '')
    .replace(/^Error:\s*/iu, '')
    .trim()
  return new Error(cleaned || fallback)
}
