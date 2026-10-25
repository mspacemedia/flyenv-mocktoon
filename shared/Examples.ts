import mockship from '../examples/mockship.json'
import mockpurchase from '../examples/mockpurchase.json'
import mocksend from '../examples/mocksend.json'
import mockstock from '../examples/mockstock.json'
import mockauth from '../examples/mockauth.json'
import catalog from '../examples/catalog.json'
import type { Example } from './types'

export const examples: Example[] = catalog
export const exampleFiles: Record<string, unknown> = {
  mockship,
  mockpurchase,
  mocksend,
  mockstock,
  mockauth
}
