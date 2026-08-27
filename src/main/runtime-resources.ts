import { MAER_RENDERER_URL } from './renderer-protocol'

export type RendererEntry =
  | Readonly<{ source: 'development'; url: string }>
  | Readonly<{ source: 'bundled'; url: string; filePath: string }>

export function resolveRendererEntry(
  isPackaged: boolean,
  developmentUrl: string | undefined,
  bundledFilePath: string,
): RendererEntry {
  if (!isPackaged && developmentUrl) {
    return Object.freeze({
      source: 'development',
      url: new URL(developmentUrl).href,
    })
  }
  return Object.freeze({
    source: 'bundled',
    url: MAER_RENDERER_URL,
    filePath: bundledFilePath,
  })
}
