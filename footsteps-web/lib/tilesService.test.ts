import { getTilesBucket } from './tilesService';

describe('getTilesBucket', () => {
  const origEnv = { ...process.env };

  afterEach(() => {
    process.env = { ...origEnv };
    jest.restoreAllMocks();
  });

  it('throws with clear error when missing', () => {
    delete process.env.GCS_TILES_BUCKET;
    const spy = jest.spyOn(console, 'error').mockImplementation(() => {});
    expect(() => getTilesBucket()).toThrow(
      'GCS_TILES_BUCKET environment variable is required',
    );
    expect(spy).toHaveBeenCalled();
  });
});
