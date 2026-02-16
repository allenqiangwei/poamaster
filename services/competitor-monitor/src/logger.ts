const PREFIX = '[Competitor]';

export const logger = {
  info: (...args: any[]) => console.log(PREFIX, ...args),
  warn: (...args: any[]) => console.warn(PREFIX, ...args),
  error: (...args: any[]) => console.error(PREFIX, ...args),
};
