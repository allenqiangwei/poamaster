const LOG_PREFIX = '[FeishuListener]';

export const logger = {
  info: (...args: unknown[]) => console.log(LOG_PREFIX, new Date().toISOString(), ...args),
  warn: (...args: unknown[]) => console.warn(LOG_PREFIX, new Date().toISOString(), ...args),
  error: (...args: unknown[]) => console.error(LOG_PREFIX, new Date().toISOString(), ...args),
  debug: (...args: unknown[]) => {
    if (process.env.DEBUG) {
      console.log(LOG_PREFIX, '[DEBUG]', new Date().toISOString(), ...args);
    }
  },
};
