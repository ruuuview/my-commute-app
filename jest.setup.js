/* eslint-disable no-undef */
// Mock react-native-mmkv
jest.mock('react-native-mmkv', () => {
  const store = new Map();
  return {
    createMMKV: jest.fn(() => ({
      getString: jest.fn((key) => store.get(key) || null),
      getNumber: jest.fn((key) => {
        const v = store.get(key);
        return v !== undefined ? Number(v) : undefined;
      }),
      getBoolean: jest.fn((key) => {
        const v = store.get(key);
        return v !== undefined ? Boolean(v) : undefined;
      }),
      set: jest.fn((key, value) => store.set(key, value)),
      delete: jest.fn((key) => store.delete(key)),
      remove: jest.fn((key) => store.delete(key)),
      contains: jest.fn((key) => store.has(key)),
      clearAll: jest.fn(() => store.clear()),
    })),
    MMKV: jest.fn().mockImplementation(() => ({
      getString: jest.fn((key) => store.get(key) || null),
      getNumber: jest.fn((key) => {
        const v = store.get(key);
        return v !== undefined ? Number(v) : undefined;
      }),
      getBoolean: jest.fn((key) => {
        const v = store.get(key);
        return v !== undefined ? Boolean(v) : undefined;
      }),
      set: jest.fn((key, value) => store.set(key, value)),
      delete: jest.fn((key) => store.delete(key)),
      remove: jest.fn((key) => store.delete(key)),
      contains: jest.fn((key) => store.has(key)),
      clearAll: jest.fn(() => store.clear()),
    })),
  };
});

// Mock expo-notifications
jest.mock('expo-notifications', () => ({
  addPushTokenListener: jest.fn(),
  getExpoPushTokenAsync: jest.fn().mockResolvedValue({ data: 'mock-token' }),
  setNotificationCategoryAsync: jest.fn(),
  scheduleNotificationAsync: jest.fn(),
}));
