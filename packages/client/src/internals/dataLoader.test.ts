import { dataLoader } from './dataLoader';

describe('dataLoader', () => {
  test('resolves matching batch result sizes', async () => {
    const loader = dataLoader<string, number>({
      validate(keys) {
        return keys.length <= 2;
      },
      fetch(keys) {
        return Promise.resolve(keys.map((key) => Number(key)));
      },
    });

    const promises = [loader.load('1'), loader.load('2')];
    await expect(Promise.all(promises)).resolves.toEqual([1, 2]);
  });

  test('throws when batch result size does not match request size', async () => {
    const loader = dataLoader<string, number>({
      validate() {
        return true;
      },
      fetch() {
        return Promise.resolve([1]);
      },
    });

    await expect(loader.load('1')).rejects.toThrowErrorMatchingInlineSnapshot(
      `"Batch result size mismatch"`,
    );
  });
});
