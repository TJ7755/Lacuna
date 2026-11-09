import { createHandler } from '../src/relay.js';
import { createVercelStore } from '../src/store.js';
import { createUsageHandler } from '../src/usageAnalytics.js';

const store = createVercelStore();
const handle = createHandler(store);
const handleUsage = createUsageHandler(store);

export default {
  async fetch(request: Request) {
    return (await handleUsage(request)) ?? handle(request);
  },
};

export const maxDuration = 60;
