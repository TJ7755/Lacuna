import { createHandler } from '../src/relay';
import { createVercelStore } from '../src/store';

const handle = createHandler(createVercelStore());

export const GET = handle;
export const PUT = handle;
export const POST = handle;
export const DELETE = handle;
export const OPTIONS = handle;

export const maxDuration = 60;
