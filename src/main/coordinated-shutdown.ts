export interface BeforeQuitEvent {
  preventDefault(): void
}

export interface CoordinatedShutdownDependencies {
  markQuitting(): void
  stopNativeVaultBridge(): void | Promise<void>
  cancelPairing(): void | Promise<void>
  deactivatePlugins(): void | Promise<void>
  disposeIpc(): void
  exit(code: number): void
}

async function settle(operation: () => void | Promise<void>): Promise<void> {
  try {
    await operation()
  } catch {
    // Shutdown remains fail-closed and continues through every cleanup stage.
  }
}

export class CoordinatedShutdown {
  private completion: Promise<void> | undefined

  constructor(private readonly dependencies: CoordinatedShutdownDependencies) {}

  request(event: BeforeQuitEvent): void {
    event.preventDefault()
    this.dependencies.markQuitting()
    this.completion ??= this.run()
  }

  wait(): Promise<void> {
    return this.completion ?? Promise.resolve()
  }

  private async run(): Promise<void> {
    await settle(() => this.dependencies.stopNativeVaultBridge())
    await settle(() => this.dependencies.cancelPairing())
    await settle(() => this.dependencies.deactivatePlugins())
    await settle(() => this.dependencies.disposeIpc())
    this.dependencies.exit(0)
  }
}
