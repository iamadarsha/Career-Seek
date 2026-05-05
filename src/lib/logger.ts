import pino from 'pino';

const transport =
  process.env.NODE_ENV !== 'production' && process.env.CAREER_SEEK_PRETTY_LOGS === '1'
    ? pino.transport({
        target: 'pino-pretty',
        options: {
          colorize: true,
          translateTime: 'SYS:standard',
          ignore: 'pid,hostname',
        },
      })
    : undefined;

export const logger = pino(
  {
    name: 'career-seek',
    level: process.env.CAREER_SEEK_LOG_LEVEL || 'info',
    redact: {
      paths: [
        'apiKey',
        '*.apiKey',
        'headers.authorization',
        '*.authorization',
        'metadata.apiKey',
      ],
      censor: '[redacted]',
    },
  },
  transport,
);
