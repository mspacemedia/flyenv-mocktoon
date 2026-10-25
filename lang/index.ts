import en from './en.json'
import zh from './zh.json'
export function createT(locale: () => string) {
  return (key: string): string => {
    const values: Record<string, string> = String(locale()).toLowerCase().startsWith('zh')
      ? { ...en, ...zh }
      : en
    return values[key] ?? key
  }
}
