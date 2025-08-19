import { ensureByteLength } from './ensureByteLength';

describe('ensureByteLength', () => {
  it('estimates byte length for strings', () => {
    expect(ensureByteLength('hello')).toBe(5);
  });

  it('returns existing byte length for ArrayBuffer', () => {
    const buf = new Uint8Array([1, 2, 3]).buffer;
    expect(ensureByteLength(buf)).toBe(3);
  });

  it('attaches byteLength for objects', () => {
    const obj: Record<string, unknown> = { foo: 'bar' };
    const expected = JSON.stringify(obj).length;
    const result = ensureByteLength(obj);
    expect(result).toBe(expected);
    expect((obj as { byteLength?: number }).byteLength).toBe(expected);
  });
});
