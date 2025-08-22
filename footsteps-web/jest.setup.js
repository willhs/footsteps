// Mock Worker for test environment
global.Worker = class Worker {
  onmessage = null;
  constructor() {}
  postMessage() {}
};

// Mock URL for Worker constructor
global.URL = global.URL || {
  createObjectURL: jest.fn(),
  revokeObjectURL: jest.fn(),
};