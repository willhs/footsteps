export type ByteLengthInput =
  | string
  | ArrayBuffer
  | ArrayBufferView
  | (Record<string, unknown> & { byteLength?: number });

/**
 * Ensures a byteLength estimate exists for the provided content.
 * Returns the existing or estimated byteLength.
 */
export function ensureByteLength(
  content: ByteLengthInput | undefined,
): number | undefined {
  if (content == null) return undefined;

  const existing = (content as { byteLength?: unknown }).byteLength;
  if (typeof existing === 'number' && Number.isFinite(existing)) {
    return existing;
  }

  let approx: number;
  if (typeof content === 'string') {
    approx = content.length;
  } else if (content instanceof ArrayBuffer || ArrayBuffer.isView(content)) {
    approx = (content as ArrayBuffer | ArrayBufferView).byteLength;
  } else {
    const json = JSON.stringify(content);
    approx = json.length;
    // Attach the estimate for objects without byteLength
    (content as Record<string, unknown>).byteLength = approx;
  }

  if (!Number.isFinite(approx) || approx <= 0) return undefined;
  return approx;
}
