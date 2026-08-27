import { describe, expect, it } from 'vitest'
import { publicIpcError } from '../src/preload/ipc-error'

describe('public IPC errors', () => {
  it('removes Electron channel and nested Error prefixes', () => {
    const result = publicIpcError(
      new Error("Error invoking remote method 'maer:open-meeting': Error: Réunion indisponible"),
      'Impossible d’ouvrir la réunion.',
    )
    expect(result.message).toBe('Réunion indisponible')
    expect(result.message).not.toMatch(/remote method|maer:/i)
  })

  it('uses a stable public fallback for non-errors', () => {
    expect(publicIpcError({ secret: 'nope' }, 'Erreur publique').message).toBe('Erreur publique')
  })
})
