import type { RendererPluginDefinition } from '../../core/renderer/plugin-registry'
import { PASSWORD_VAULT_MANIFEST } from '../manifest'
import {
  PasswordVaultBridgeError,
  type PasswordVaultBridge,
} from '../preload/bridge'
import type {
  PasswordVaultEntrySummary,
  PasswordVaultState,
  PasswordVaultStatus,
} from '../shared/contract'
import './password-vault.css'

function button(label: string, action: string, className: string): HTMLButtonElement {
  const result = document.createElement('button')
  result.type = 'button'
  result.className = className
  result.dataset.vaultAction = action
  result.textContent = label
  return result
}

function wipeSecretInputs(root: ParentNode): void {
  root.querySelectorAll<HTMLInputElement>('input[type="password"]').forEach((input) => {
    input.value = ''
  })
}

function field(
  label: string,
  name: string,
  value: string,
  options: { type?: string; required?: boolean; autocomplete?: string; maximum: number },
): HTMLLabelElement {
  const wrapper = document.createElement('label')
  wrapper.className = 'maer-vault-field'
  const caption = document.createElement('span')
  caption.textContent = label
  const input = document.createElement('input')
  input.name = name
  input.type = options.type ?? 'text'
  input.value = value
  input.maxLength = options.maximum
  input.required = options.required ?? false
  input.setAttribute('autocomplete', options.autocomplete ?? 'off')
  wrapper.append(caption, input)
  return wrapper
}

export class PasswordVaultPanel {
  private entries: readonly PasswordVaultEntrySummary[] = []
  private selectedId: string | undefined
  private query = ''
  private searchTimer: ReturnType<typeof setTimeout> | undefined
  private requestSequence = 0
  private disposed = false

  constructor(
    private readonly root: HTMLElement,
    private readonly bridge: PasswordVaultBridge,
  ) {}

  mount(): () => void {
    this.root.classList.add('maer-password-vault')
    this.root.addEventListener('click', this.onClick)
    this.root.addEventListener('input', this.onInput)
    this.root.addEventListener('submit', this.onSubmit)
    this.renderLoading('Ouverture du coffre…')
    void this.refreshStatus()
    return () => this.dispose()
  }

  private dispose(): void {
    if (this.disposed) return
    this.disposed = true
    if (this.searchTimer) clearTimeout(this.searchTimer)
    this.searchTimer = undefined
    this.requestSequence += 1
    this.root.removeEventListener('click', this.onClick)
    this.root.removeEventListener('input', this.onInput)
    this.root.removeEventListener('submit', this.onSubmit)
    wipeSecretInputs(this.root)
    this.root.replaceChildren()
    this.root.classList.remove('maer-password-vault')
  }

  private renderLoading(message: string): void {
    wipeSecretInputs(this.root)
    const section = document.createElement('section')
    section.className = 'maer-vault-state'
    const spinner = document.createElement('span')
    spinner.className = 'maer-vault-spinner'
    spinner.setAttribute('aria-hidden', 'true')
    const copy = document.createElement('p')
    copy.setAttribute('role', 'status')
    copy.textContent = message
    section.append(spinner, copy)
    this.root.replaceChildren(section)
  }

  private renderLocked(status: PasswordVaultStatus, message?: string): void {
    wipeSecretInputs(this.root)
    this.entries = []
    this.selectedId = undefined
    const section = document.createElement('section')
    section.className = 'maer-vault-state'
    const icon = document.createElement('div')
    icon.className = 'maer-vault-lock-icon'
    icon.setAttribute('aria-hidden', 'true')
    icon.textContent = status.state === 'recovery-required' ? '!' : '●'
    const heading = document.createElement('h3')
    const description = document.createElement('p')
    if (status.state === 'uninitialized') {
      heading.textContent = 'Créer votre coffre local'
      description.textContent =
        'Les mots de passe seront chiffrés sur cet ordinateur et la clé restera dans le Gestionnaire d’identifiants Windows.'
      section.append(
        icon,
        heading,
        description,
        button('Créer et déverrouiller', 'initialize', 'maer-vault-primary'),
      )
    } else if (status.state === 'recovery-required') {
      heading.textContent = 'Récupération nécessaire'
      description.textContent =
        'Le fichier et la clé Windows ne correspondent plus. Aucune donnée ne sera écrasée automatiquement.'
      section.append(icon, heading, description)
    } else {
      heading.textContent = 'Coffre verrouillé'
      description.textContent =
        'Déverrouillez-le pour consulter et modifier vos identifiants enregistrés.'
      section.append(
        icon,
        heading,
        description,
        button('Déverrouiller', 'unlock', 'maer-vault-primary'),
      )
    }
    if (message) {
      const alert = document.createElement('p')
      alert.className = 'maer-vault-alert'
      alert.setAttribute('role', 'alert')
      alert.textContent = message
      section.append(alert)
    }
    section.append(this.browserExtensionSection())
    this.root.replaceChildren(section)
  }

  private renderUnlocked(status: PasswordVaultStatus): void {
    wipeSecretInputs(this.root)
    const shell = document.createElement('section')
    shell.className = 'maer-vault-shell'

    const toolbar = document.createElement('div')
    toolbar.className = 'maer-vault-toolbar'
    const count = document.createElement('span')
    count.dataset.vaultCount = ''
    count.textContent = `${status.entryCount ?? 0} mot${status.entryCount === 1 ? '' : 's'} de passe`
    const lock = button('Verrouiller', 'lock', 'maer-vault-link')
    toolbar.append(count, lock)

    const searchRow = document.createElement('div')
    searchRow.className = 'maer-vault-search-row'
    const search = document.createElement('input')
    search.type = 'search'
    search.dataset.vaultSearch = ''
    search.maxLength = 320
    search.autocomplete = 'off'
    search.placeholder = 'Rechercher dans les identifiants'
    search.setAttribute('aria-label', 'Rechercher dans les mots de passe')
    search.value = this.query
    searchRow.append(search, button('Ajouter', 'add', 'maer-vault-primary'))

    const notice = document.createElement('div')
    notice.className = 'maer-vault-notice'
    notice.dataset.vaultNotice = ''
    notice.setAttribute('role', 'status')
    notice.setAttribute('aria-live', 'polite')

    const body = document.createElement('div')
    body.className = 'maer-vault-body'
    const list = document.createElement('div')
    list.className = 'maer-vault-list'
    list.dataset.vaultList = ''
    list.setAttribute('aria-label', 'Identifiants enregistrés')
    const detail = document.createElement('div')
    detail.className = 'maer-vault-detail'
    detail.dataset.vaultDetail = ''
    body.append(list, detail)
    shell.append(toolbar, searchRow, notice, body, this.browserExtensionSection())
    this.root.replaceChildren(shell)
    this.renderEntries()
    void this.loadEntries(this.query)
  }

  private renderEntries(): void {
    const list = this.root.querySelector<HTMLElement>('[data-vault-list]')
    if (!list) return
    list.replaceChildren()
    if (this.entries.length === 0) {
      const empty = document.createElement('p')
      empty.className = 'maer-vault-empty'
      empty.textContent = this.query
        ? 'Aucun identifiant ne correspond à cette recherche.'
        : 'Aucun mot de passe enregistré.'
      list.append(empty)
      this.renderDetail()
      return
    }
    if (!this.selectedId || !this.entries.some((entry) => entry.id === this.selectedId)) {
      this.selectedId = this.entries[0]?.id
    }
    for (const entry of this.entries) {
      const row = document.createElement('button')
      row.type = 'button'
      row.className = 'maer-vault-entry'
      row.dataset.vaultAction = 'select'
      row.dataset.entryId = entry.id
      row.classList.toggle('is-selected', entry.id === this.selectedId)
      row.setAttribute('aria-pressed', String(entry.id === this.selectedId))
      const avatar = document.createElement('span')
      avatar.className = 'maer-vault-entry-icon'
      avatar.textContent = (entry.title[0] ?? '?').toLocaleUpperCase('fr')
      const copy = document.createElement('span')
      const title = document.createElement('strong')
      title.textContent = entry.title
      const username = document.createElement('small')
      username.textContent = entry.username || 'Aucun nom d’utilisateur'
      copy.append(title, username)
      row.append(avatar, copy)
      list.append(row)
    }
    this.renderDetail()
  }

  private renderDetail(): void {
    const detail = this.root.querySelector<HTMLElement>('[data-vault-detail]')
    if (!detail) return
    detail.replaceChildren()
    const entry = this.entries.find((candidate) => candidate.id === this.selectedId)
    if (!entry) {
      const empty = document.createElement('p')
      empty.className = 'maer-vault-empty maer-vault-detail-empty'
      empty.textContent = 'Ajoutez un identifiant pour commencer.'
      detail.append(empty)
      return
    }
    const heading = document.createElement('div')
    heading.className = 'maer-vault-detail-heading'
    const avatar = document.createElement('span')
    avatar.className = 'maer-vault-detail-icon'
    avatar.textContent = (entry.title[0] ?? '?').toLocaleUpperCase('fr')
    const title = document.createElement('h3')
    title.textContent = entry.title
    heading.append(avatar, title)

    const facts = document.createElement('dl')
    const factValues: ReadonlyArray<readonly [string, string]> = [
      ["Nom d’utilisateur", entry.username || '—'],
      ['Adresse', entry.url],
      ['Modifié', new Date(entry.updatedAt).toLocaleString('fr-FR')],
    ]
    for (const [label, value] of factValues) {
      const term = document.createElement('dt')
      term.textContent = label
      const description = document.createElement('dd')
      description.textContent = value
      facts.append(term, description)
    }

    const actions = document.createElement('div')
    actions.className = 'maer-vault-detail-actions'
    const copy = button('Copier le mot de passe', 'copy', 'maer-vault-primary')
    const edit = button('Modifier', 'edit', 'maer-vault-secondary')
    const remove = button('Supprimer', 'delete', 'maer-vault-danger')
    for (const action of [copy, edit, remove]) action.dataset.entryId = entry.id
    actions.append(copy, edit, remove)
    detail.append(heading, facts, actions)
  }

  private renderEditor(entry?: PasswordVaultEntrySummary): void {
    const detail = this.root.querySelector<HTMLElement>('[data-vault-detail]')
    if (!detail) return
    wipeSecretInputs(detail)
    const form = document.createElement('form')
    form.className = 'maer-vault-form'
    form.dataset.vaultForm = entry ? 'update' : 'add'
    if (entry) form.dataset.entryId = entry.id
    const heading = document.createElement('h3')
    heading.textContent = entry ? 'Modifier l’identifiant' : 'Nouvel identifiant'
    form.append(
      heading,
      field('Nom du site', 'title', entry?.title ?? '', {
        required: true,
        autocomplete: 'off',
        maximum: 160,
      }),
      field('Nom d’utilisateur', 'username', entry?.username ?? '', {
        autocomplete: 'off',
        maximum: 320,
      }),
      field('Adresse HTTPS', 'url', entry?.url ?? 'https://', {
        type: 'url',
        required: true,
        autocomplete: 'off',
        maximum: 2048,
      }),
    )
    const passwordField = field(
      entry ? 'Nouveau mot de passe (facultatif)' : 'Mot de passe',
      'password',
      '',
      {
        type: 'password',
        required: !entry,
        autocomplete: 'new-password',
        maximum: 4096,
      },
    )
    const passwordActions = document.createElement('div')
    passwordActions.className = 'maer-vault-password-actions'
    passwordActions.append(
      button('Générer un mot de passe sûr', 'generate', 'maer-vault-link'),
    )
    const actions = document.createElement('div')
    actions.className = 'maer-vault-form-actions'
    const save = document.createElement('button')
    save.type = 'submit'
    save.className = 'maer-vault-primary'
    save.textContent = 'Enregistrer'
    actions.append(save, button('Annuler', 'cancel', 'maer-vault-secondary'))
    form.append(passwordField, passwordActions, actions)
    detail.replaceChildren(form)
    form.querySelector<HTMLInputElement>('input[name="title"]')?.focus()
  }

  private async refreshStatus(): Promise<void> {
    try {
      const status = await this.bridge.status()
      if (this.disposed) return
      if (status.state === 'unlocked') this.renderUnlocked(status)
      else this.renderLocked(status)
    } catch (error) {
      if (!this.disposed) {
        this.renderLocked({ state: 'locked', entryCount: null }, this.message(error))
      }
    }
  }

  private async loadEntries(query: string): Promise<void> {
    const sequence = ++this.requestSequence
    try {
      const entries = query ? await this.bridge.search(query) : await this.bridge.list()
      if (this.disposed || sequence !== this.requestSequence) return
      this.entries = entries
      this.renderEntries()
      const count = this.root.querySelector<HTMLElement>('[data-vault-count]')
      if (count) count.textContent = `${entries.length} résultat${entries.length === 1 ? '' : 's'}`
    } catch (error) {
      if (!this.disposed && sequence === this.requestSequence) this.handleError(error)
    }
  }

  private message(error: unknown): string {
    return error instanceof Error ? error.message : 'Le coffre est indisponible.'
  }

  private notice(message: string): void {
    const notice = this.root.querySelector<HTMLElement>('[data-vault-notice]')
    if (notice) notice.textContent = message
  }

  private extensionNotice(message: string): void {
    const notice = this.root.querySelector<HTMLElement>('[data-vault-extension-notice]')
    if (notice) notice.textContent = message
  }

  private browserExtensionSection(): HTMLElement {
    const section = document.createElement('section')
    section.className = 'maer-vault-extension'
    section.setAttribute('aria-labelledby', 'maer-vault-extension-title')

    const copy = document.createElement('div')
    copy.className = 'maer-vault-extension-copy'
    const heading = document.createElement('h3')
    heading.id = 'maer-vault-extension-title'
    heading.textContent = 'Extension navigateur MAER'
    const description = document.createElement('p')
    description.textContent =
      'Installez le remplissage sécurisé du coffre dans Edge, Chrome ou Firefox.'
    copy.append(heading, description)

    const actions = document.createElement('div')
    actions.className = 'maer-vault-extension-actions'
    actions.append(
      button('Ouvrir le dossier', 'open-extension-folder', 'maer-vault-secondary'),
      button('Ouvrir le guide', 'open-extension-guide', 'maer-vault-link'),
    )

    const instructions = document.createElement('details')
    instructions.className = 'maer-vault-extension-instructions'
    const summary = document.createElement('summary')
    summary.textContent = 'Instructions Edge, Chrome et Firefox'
    const list = document.createElement('ol')
    for (const instruction of [
      'Edge : edge://extensions → Mode développeur → Charger l’extension non empaquetée → dist/chromium.',
      'Chrome : chrome://extensions → Mode développeur → Charger l’extension non empaquetée → dist/chromium.',
      'Firefox : about:debugging#/runtime/this-firefox → Charger un module complémentaire temporaire → dist/firefox/manifest.json.',
    ]) {
      const item = document.createElement('li')
      item.textContent = instruction
      list.append(item)
    }
    instructions.append(summary, list)

    const notice = document.createElement('p')
    notice.className = 'maer-vault-extension-notice'
    notice.dataset.vaultExtensionNotice = ''
    notice.setAttribute('role', 'status')
    notice.setAttribute('aria-live', 'polite')

    section.append(copy, actions, instructions, notice)
    return section
  }

  private handleError(error: unknown): void {
    if (this.disposed) return
    if (error instanceof PasswordVaultBridgeError) {
      if (error.code === 'uninitialized') {
        this.renderLocked({ state: 'uninitialized', entryCount: null })
        return
      }
      if (error.code === 'locked') {
        this.renderLocked({ state: 'locked', entryCount: null })
        return
      }
      if (error.code === 'recovery-required' || error.code === 'corrupt-vault') {
        this.renderLocked(
          { state: 'recovery-required', entryCount: null },
          this.message(error),
        )
        return
      }
    }
    this.notice(this.message(error))
  }

  private readonly onInput = (event: Event): void => {
    if (!(event.target instanceof HTMLInputElement) || !event.target.matches('[data-vault-search]')) {
      return
    }
    this.query = event.target.value
    if (this.searchTimer) clearTimeout(this.searchTimer)
    this.searchTimer = setTimeout(() => {
      this.searchTimer = undefined
      void this.loadEntries(this.query.trim())
    }, 180)
  }

  private readonly onClick = (event: Event): void => {
    const target = event.target instanceof Element
      ? event.target.closest<HTMLButtonElement>('[data-vault-action]')
      : null
    if (!target) return
    const action = target.dataset.vaultAction
    const entryId = target.dataset.entryId
    switch (action) {
      case 'initialize':
      case 'unlock':
        target.disabled = true
        this.renderLoading(action === 'initialize' ? 'Création du coffre…' : 'Déverrouillage…')
        void (action === 'initialize' ? this.bridge.initialize() : this.bridge.unlock())
          .then((status) => {
            if (!this.disposed) this.renderUnlocked(status)
          })
          .catch((error: unknown) => {
            if (!this.disposed) this.handleError(error)
          })
        break
      case 'lock':
        wipeSecretInputs(this.root)
        this.renderLoading('Verrouillage…')
        void this.bridge.lock()
          .then((status) => {
            if (!this.disposed) this.renderLocked(status)
          })
          .catch((error: unknown) => {
            if (!this.disposed) this.handleError(error)
          })
        break
      case 'add':
        this.renderEditor()
        break
      case 'cancel':
        wipeSecretInputs(this.root)
        this.renderDetail()
        break
      case 'select':
        if (entryId) {
          wipeSecretInputs(this.root)
          this.selectedId = entryId
          this.renderEntries()
        }
        break
      case 'edit': {
        const entry = this.entries.find((candidate) => candidate.id === entryId)
        if (entry) this.renderEditor(entry)
        break
      }
      case 'generate':
        target.disabled = true
        void this.bridge.generate(20)
          .then((password) => {
            if (this.disposed) return
            const input = this.root.querySelector<HTMLInputElement>('input[name="password"]')
            if (input) {
              input.value = password
              input.focus()
              input.select()
            }
          })
          .catch((error: unknown) => this.handleError(error))
          .finally(() => {
            target.disabled = false
          })
        break
      case 'copy':
        if (!entryId) break
        target.disabled = true
        void this.bridge.copy(entryId)
          .then((result) => {
            if (!this.disposed) {
              this.notice(`Mot de passe copié. Effacement dans ${result.clearAfterSeconds} secondes.`)
            }
          })
          .catch((error: unknown) => this.handleError(error))
          .finally(() => {
            target.disabled = false
          })
        break
      case 'delete':
        if (!entryId || !window.confirm('Supprimer définitivement cet identifiant du coffre ?')) break
        target.disabled = true
        void this.bridge.delete(entryId)
          .then(() => {
            if (this.disposed) return
            this.selectedId = undefined
            this.notice('Identifiant supprimé.')
            void this.loadEntries(this.query.trim())
          })
          .catch((error: unknown) => this.handleError(error))
          .finally(() => {
            target.disabled = false
          })
        break
      case 'open-extension-folder':
      case 'open-extension-guide': {
        target.disabled = true
        this.extensionNotice('Ouverture de la ressource locale…')
        const operation = action === 'open-extension-folder'
          ? this.bridge.openExtensionFolder()
          : this.bridge.openExtensionGuide()
        void operation
          .then(() => {
            if (!this.disposed) {
              this.extensionNotice(
                action === 'open-extension-folder'
                  ? 'Dossier de l’extension ouvert.'
                  : 'Guide d’installation ouvert ou sélectionné dans son dossier.',
              )
            }
          })
          .catch((error: unknown) => {
            if (!this.disposed) this.extensionNotice(this.message(error))
          })
          .finally(() => {
            target.disabled = false
          })
        break
      }
    }
  }

  private readonly onSubmit = (event: Event): void => {
    if (!(event.target instanceof HTMLFormElement) || !event.target.matches('[data-vault-form]')) {
      return
    }
    event.preventDefault()
    const form = event.target
    const title = form.elements.namedItem('title') as HTMLInputElement | null
    const username = form.elements.namedItem('username') as HTMLInputElement | null
    const url = form.elements.namedItem('url') as HTMLInputElement | null
    const password = form.elements.namedItem('password') as HTMLInputElement | null
    if (!title || !username || !url || !password || !form.reportValidity()) return
    const submit = form.querySelector<HTMLButtonElement>('button[type="submit"]')
    if (submit) submit.disabled = true
    const entryId = form.dataset.entryId
    const operation = entryId
      ? this.bridge.update({
          id: entryId,
          title: title.value,
          username: username.value,
          url: url.value,
          password: password.value
            ? { mode: 'replace', value: password.value }
            : { mode: 'keep' },
        })
      : this.bridge.add({
          title: title.value,
          username: username.value,
          url: url.value,
          password: password.value,
        })
    void operation
      .then((saved) => {
        password.value = ''
        if (this.disposed) return
        this.selectedId = saved.id
        this.notice(entryId ? 'Identifiant mis à jour.' : 'Identifiant ajouté.')
        void this.loadEntries(this.query.trim())
      })
      .catch((error: unknown) => {
        password.value = ''
        if (!this.disposed) this.handleError(error)
      })
      .finally(() => {
        if (submit) submit.disabled = false
      })
  }
}

export function mountPasswordVaultPanel(
  root: HTMLElement,
  bridge: PasswordVaultBridge,
): () => void {
  return new PasswordVaultPanel(root, bridge).mount()
}

export const passwordVaultRendererPlugin: RendererPluginDefinition = {
  manifest: PASSWORD_VAULT_MANIFEST,
  activate(context) {
    context.registerPanel('passwords', (root) =>
      mountPasswordVaultPanel(root, window.maerPlugins.passwordVault),
    )
  },
}
