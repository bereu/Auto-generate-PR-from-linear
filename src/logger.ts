export const logger = {
  info: (msg: string) => process.stdout.write(`${msg}\n`),
  warn: (msg: string) => process.stderr.write(`WARN ${msg}\n`),
  error: (msg: string) => process.stderr.write(`ERROR ${msg}\n`),
};
