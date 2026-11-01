// Motion's full feature set, loaded after the app's first paint. `domMax` carries layout
// animation, which every `layout` and `layoutId` element (the gliding pills among them)
// needs; `domAnimation` silently skips it. Loading it asynchronously keeps it out of the
// first-load bundle.
export { domMax as default } from 'motion/react';
