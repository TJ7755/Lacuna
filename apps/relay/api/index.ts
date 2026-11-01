import { createHandler } from '../src/relay.js';
import { createVercelStore } from '../src/store.js';

const handle = createHandler(createVercelStore());

export default {
  fetch(request: Request) {
    return handle(request);
  },
};

export const maxDuration = 60;
