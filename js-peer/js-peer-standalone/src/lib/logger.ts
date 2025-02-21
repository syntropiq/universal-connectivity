import debug from 'debug'

export function enable(namespaces: string): void {
  debug.enable(namespaces)
}

export const forComponent = (component: string) => {
  const logger = debug(`ui:${component}`)
  logger.log = console.log.bind(console)
  return logger
}