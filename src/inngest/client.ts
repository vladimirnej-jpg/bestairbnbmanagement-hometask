import 'server-only';

import { Inngest } from 'inngest';

const isDevelopmentWithoutExplicitMode =
  process.env.NODE_ENV !== 'production' && process.env.INNGEST_DEV === undefined;

export const inngest = new Inngest({
  id: 'bestairbnb',
  isDev: process.env.INNGEST_DEV === '1' || isDevelopmentWithoutExplicitMode,
});
