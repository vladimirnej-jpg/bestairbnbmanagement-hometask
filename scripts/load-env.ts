import path from 'node:path';

import * as nextEnv from '@next/env';

const { loadEnvConfig } = nextEnv;

loadEnvConfig(path.resolve(__dirname, '..'));
