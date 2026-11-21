import { act, renderHook } from '@testing-library/react';
import { lazy, useLazy } from './lazyModule';

const flush = () => act(async () => {});

describe('lazy', () => {
  it('downloads once for every caller', async () => {
    const importer = jest.fn(async () => ({ value: 1 }));
    const mod = lazy(importer);
    expect(mod.current()).toBeNull();
    const [a, b] = await Promise.all([mod.load(), mod.load()]);
    expect(a).toBe(b);
    expect(mod.current()).toBe(a);
    expect(importer).toHaveBeenCalledTimes(1);
  });

  it('tries again after a failed download', async () => {
    const importer = jest.fn().mockRejectedValueOnce(new Error('offline')).mockResolvedValueOnce({ value: 2 });
    const mod = lazy(importer);
    await expect(mod.load()).rejects.toThrow('offline');
    await expect(mod.load()).resolves.toEqual({ value: 2 });
  });
});

describe('useLazy', () => {
  it('loads nothing until wanted, then keeps the module', async () => {
    const importer = jest.fn(async () => ({ value: 3 }));
    const mod = lazy(importer);
    const { result, rerender } = renderHook(({ wanted }) => useLazy(mod, wanted), { initialProps: { wanted: false } });
    await flush();
    expect(result.current).toBeNull();
    expect(importer).not.toHaveBeenCalled();
    rerender({ wanted: true });
    await flush();
    expect(result.current).toEqual({ value: 3 });
    rerender({ wanted: false });
    expect(result.current).toEqual({ value: 3 });
  });

  it('starts with the module when another caller already loaded it', async () => {
    const mod = lazy(async () => ({ value: 4 }));
    await mod.load();
    const { result } = renderHook(() => useLazy(mod, false));
    expect(result.current).toEqual({ value: 4 });
  });
});
