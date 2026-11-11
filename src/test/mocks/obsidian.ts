/**
 * Runtime stand-in for the `obsidian` package.
 *
 * The real package ships type declarations only (`main` is an empty string), so
 * any module importing a *value* from it needs the alias configured in
 * `vitest.config.mts`.
 *
 * Keep the exports in sync with the symbols the source imports: a missing named
 * export fails at import time, not where the value is used.
 *
 * The UI components (`ButtonComponent`, `Setting`, …) create real DOM elements
 * when a DOM environment is active, so component tests can click, type and
 * assert on them. In the plain node environment they degrade to inert objects.
 */
import type { App, EventRef } from 'obsidian'

const stubEl = <T>() => ({}) as T

const isDomAvailable = (): boolean =>
  typeof document !== 'undefined' &&
  typeof document.createElement === 'function'

/** Obsidian augments DOM elements with these helpers; component code uses them. */
function attachHelpers<T extends HTMLElement>(element: T): T {
  element.empty = () => {
    while (element.firstChild) element.removeChild(element.firstChild)
  }
  element.setText = (text: string) => {
    element.textContent = text
  }
  element.setAttrs = (
    attrs: Record<string, string | number | boolean | null>,
  ) => {
    for (const [key, value] of Object.entries(attrs)) {
      if (value === null) element.removeAttribute(key)
      else element.setAttribute(key, String(value))
    }
  }
  element.addClass = (...classes: string[]) => {
    element.classList.add(...classes)
  }
  return element
}

function makeEl<K extends keyof HTMLElementTagNameMap>(
  tag: K,
): HTMLElementTagNameMap[K] {
  const element = isDomAvailable()
    ? document.createElement(tag)
    : ({} as HTMLElementTagNameMap[K])
  return attachHelpers(element)
}

export function normalizePath(path: string): string {
  if (path === '/') return '/'
  let normalized = path.replace(/\\/g, '/')
  normalized = normalized.replace(/\/+/g, '/')
  if (normalized.length > 1 && normalized.endsWith('/')) {
    normalized = normalized.slice(0, -1)
  }
  return normalized
}

export function parseLinktext(linktext: string): {
  path: string
  subpath: string
} {
  const hashIndex = linktext.indexOf('#')
  if (hashIndex === -1) return { path: linktext, subpath: '' }
  return {
    path: linktext.slice(0, hashIndex),
    subpath: linktext.slice(hashIndex),
  }
}

export function resolveSubpath(
  _cache: unknown,
  _subpath: string,
): { start: { line: number; col: number; offset: number } } | null {
  return null
}

export function setIcon(_el: unknown, _icon: string): void {}

export const Platform = {
  isDesktop: true,
  isMobile: false,
  isDesktopApp: true,
  isMobileApp: false,
}

export class Component {
  private children: Component[] = []

  addChild<T extends Component>(child: T): T {
    this.children.push(child)
    return child
  }

  removeChild<T extends Component>(child: T): T {
    this.children = this.children.filter((candidate) => candidate !== child)
    return child
  }

  register(_cleanup: () => void): void {}
  registerEvent(_ref: EventRef): void {}
  registerDomEvent(
    _el: unknown,
    _event: string,
    _callback: (event: unknown) => void,
  ): void {}
  onload(): void {}
  onunload(): void {}
  load(): void {
    this.onload()
  }
  unload(): void {
    this.onunload()
  }
}

export class Plugin extends Component {
  app: App
  manifest: unknown
  private commands: unknown[] = []

  constructor(app: App, manifest?: unknown) {
    super()
    this.app = app
    this.manifest = manifest ?? {}
  }

  addCommand(command: unknown): void {
    this.commands.push(command)
  }

  addRibbonIcon(
    _icon: string,
    _title: string,
    _callback: (event: unknown) => void,
  ): HTMLElement {
    return stubEl<HTMLElement>()
  }

  addSettingTab(_tab: unknown): void {}
  addStatusBarItem(): HTMLElement {
    return stubEl<HTMLElement>()
  }
  registerView(_type: string, _factory: unknown): void {}
  registerMarkdownPostProcessor(_processor: unknown): unknown {
    return {}
  }
  registerInterval(id: number): number {
    return id
  }

  async loadData(): Promise<unknown> {
    return {}
  }

  async saveData(_data: unknown): Promise<void> {}
}

export class ItemView extends Component {
  app: App
  leaf: WorkspaceLeaf
  containerEl: HTMLElement = stubEl<HTMLElement>()

  constructor(leaf: WorkspaceLeaf) {
    super()
    this.leaf = leaf
    this.app = leaf.app ?? stubEl<App>()
  }

  getViewType(): string {
    return ''
  }
  getDisplayText(): string {
    return ''
  }
  getIcon(): string {
    return ''
  }
  async onOpen(): Promise<void> {}
  async onClose(): Promise<void> {}
}

export class WorkspaceLeaf {
  app: App | null = null
  view: unknown = null
}

export class PluginSettingTab {
  app: App
  plugin: unknown
  containerEl: HTMLElement = stubEl<HTMLElement>()

  constructor(app: App, plugin: unknown) {
    this.app = app
    this.plugin = plugin
  }

  display(): void {}
  hide(): void {}
}

export class Modal {
  app: App
  containerEl: HTMLElement
  modalEl: HTMLElement
  titleEl: HTMLElement
  contentEl: HTMLElement

  constructor(app: App) {
    this.app = app
    this.containerEl = makeEl('div')
    this.modalEl = makeEl('div')
    this.titleEl = makeEl('div')
    this.contentEl = makeEl('div')
    if (isDomAvailable()) {
      this.containerEl.appendChild(this.modalEl)
      this.modalEl.appendChild(this.titleEl)
      this.modalEl.appendChild(this.contentEl)
    }
  }

  open(): void {
    if (isDomAvailable()) document.body.appendChild(this.containerEl)
    this.onOpen()
  }
  close(): void {
    this.onClose()
    if (isDomAvailable()) this.containerEl.remove()
  }
  onOpen(): void {}
  onClose(): void {}
  setTitle(title: string): this {
    this.titleEl.setText(title)
    return this
  }
}

export class Notice {
  static messages: string[] = []

  noticeEl: HTMLElement = stubEl<HTMLElement>()
  message: string
  timeout: number | undefined

  constructor(message: string, timeout?: number) {
    this.message = message
    this.timeout = timeout
    Notice.messages.push(message)
  }

  setMessage(message: string): this {
    this.message = message
    return this
  }
  hide(): void {}
}

export class TextComponent {
  inputEl: HTMLInputElement
  value = ''
  disabled = false
  private changeHandler: ((value: string) => void) | null = null

  constructor(containerEl?: HTMLElement, tag: 'input' | 'textarea' = 'input') {
    this.inputEl = (
      tag === 'textarea' ? makeEl('textarea') : makeEl('input')
    ) as HTMLInputElement
    containerEl?.appendChild(this.inputEl)
    if (isDomAvailable()) {
      this.inputEl.addEventListener('input', () => {
        this.changeHandler?.(this.inputEl.value)
      })
    }
  }

  setValue(value: string): this {
    this.value = value
    this.inputEl.value = value
    return this
  }
  getValue(): string {
    return this.value
  }
  setPlaceholder(placeholder: string): this {
    this.inputEl.placeholder = placeholder
    return this
  }
  setDisabled(disabled: boolean): this {
    this.disabled = disabled
    this.inputEl.disabled = disabled
    return this
  }
  onChange(callback: (value: string) => void): this {
    this.changeHandler = callback
    return this
  }
  onChanged(): void {}
  setReadOnly(readOnly: boolean): this {
    this.inputEl.readOnly = readOnly
    return this
  }
}

export class TextAreaComponent extends TextComponent {
  constructor(containerEl?: HTMLElement) {
    super(containerEl, 'textarea')
  }
}

export class ToggleComponent {
  toggleEl: HTMLInputElement
  value = false
  disabled = false
  private changeHandler: ((value: boolean) => void) | null = null

  constructor(containerEl?: HTMLElement) {
    this.toggleEl = makeEl('input')
    this.toggleEl.type = 'checkbox'
    containerEl?.appendChild(this.toggleEl)
    if (isDomAvailable()) {
      this.toggleEl.addEventListener('change', () => {
        this.changeHandler?.(this.toggleEl.checked)
      })
    }
  }

  setValue(value: boolean): this {
    this.value = value
    this.toggleEl.checked = value
    return this
  }
  getValue(): boolean {
    return this.value
  }
  setDisabled(disabled: boolean): this {
    this.disabled = disabled
    this.toggleEl.disabled = disabled
    return this
  }
  onChange(callback: (value: boolean) => void): this {
    this.changeHandler = callback
    return this
  }
}

export class DropdownComponent {
  selectEl: HTMLSelectElement
  value = ''
  disabled = false
  private changeHandler: ((value: string) => void) | null = null

  constructor(containerEl?: HTMLElement) {
    this.selectEl = makeEl('select')
    containerEl?.appendChild(this.selectEl)
    if (isDomAvailable()) {
      this.selectEl.addEventListener('change', () => {
        this.changeHandler?.(this.selectEl.value)
      })
    }
  }

  addOption(value: string, display: string): this {
    if (isDomAvailable()) {
      const option = document.createElement('option')
      option.value = value
      option.textContent = display
      this.selectEl.appendChild(option)
    }
    return this
  }
  addOptions(options: Record<string, string>): this {
    for (const [value, display] of Object.entries(options)) {
      this.addOption(value, display)
    }
    return this
  }
  setValue(value: string): this {
    this.value = value
    if (isDomAvailable()) this.selectEl.value = value
    return this
  }
  getValue(): string {
    return this.value
  }
  setDisabled(disabled: boolean): this {
    this.disabled = disabled
    this.selectEl.disabled = disabled
    return this
  }
  onChange(callback: (value: string) => void): this {
    this.changeHandler = callback
    return this
  }
}

export class ButtonComponent {
  buttonEl: HTMLButtonElement
  disabled = false
  private clickHandler: ((event: MouseEvent) => void) | null = null

  constructor(containerEl?: HTMLElement) {
    this.buttonEl = makeEl('button')
    containerEl?.appendChild(this.buttonEl)
    if (isDomAvailable()) {
      this.buttonEl.addEventListener('click', (event) => {
        this.clickHandler?.(event)
      })
    }
  }

  setButtonText(text: string): this {
    this.buttonEl.textContent = text
    return this
  }
  setIcon(icon: string): this {
    this.buttonEl.setAttribute('data-icon', icon)
    return this
  }
  setTooltip(tooltip: string): this {
    this.buttonEl.setAttribute('aria-label', tooltip)
    return this
  }
  setCta(): this {
    this.buttonEl.addClass('mod-cta')
    return this
  }
  setWarning(): this {
    this.buttonEl.addClass('mod-warning')
    return this
  }
  removeCta(): this {
    if (isDomAvailable()) this.buttonEl.classList.remove('mod-cta')
    return this
  }
  setDisabled(disabled: boolean): this {
    this.disabled = disabled
    this.buttonEl.disabled = disabled
    return this
  }
  onClick(callback: (event: MouseEvent) => void): this {
    this.clickHandler = callback
    return this
  }
}

export class ExtraButtonComponent extends ButtonComponent {}

export class SecretComponent {
  inputEl: HTMLInputElement
  value = ''
  private changeHandler: ((value: string) => void) | null = null

  constructor(_app: App, containerEl?: HTMLElement) {
    this.inputEl = makeEl('input')
    containerEl?.appendChild(this.inputEl)
    if (isDomAvailable()) {
      this.inputEl.addEventListener('input', () => {
        this.changeHandler?.(this.inputEl.value)
      })
    }
  }

  setValue(value: string): this {
    this.value = value
    this.inputEl.value = value
    return this
  }
  onChange(callback: (value: string) => void): this {
    this.changeHandler = callback
    return this
  }
}

export class Setting {
  settingEl: HTMLElement
  nameEl: HTMLElement
  descEl: HTMLElement
  controlEl: HTMLElement
  components: unknown[] = []

  constructor(public containerEl: HTMLElement) {
    this.settingEl = makeEl('div')
    this.nameEl = makeEl('div')
    this.descEl = makeEl('div')
    this.controlEl = makeEl('div')
    if (isDomAvailable()) {
      this.settingEl.addClass('setting-item')
      this.settingEl.appendChild(this.nameEl)
      this.settingEl.appendChild(this.descEl)
      this.settingEl.appendChild(this.controlEl)
      this.containerEl.appendChild(this.settingEl)
    }
  }

  setName(name: string): this {
    this.nameEl.setText(name)
    return this
  }
  setDesc(desc: string): this {
    this.descEl.setText(desc)
    return this
  }
  setHeading(): this {
    this.settingEl.addClass('setting-item-heading')
    return this
  }
  setClass(cls: string): this {
    this.settingEl.addClass(cls)
    return this
  }
  setDisabled(disabled: boolean): this {
    if (isDomAvailable()) {
      this.settingEl.classList.toggle('is-disabled', disabled)
    }
    return this
  }
  clear(): void {
    this.settingEl.empty()
  }
  addText(callback?: (component: TextComponent) => void): this {
    const component = new TextComponent(this.controlEl)
    this.components.push(component)
    callback?.(component)
    return this
  }
  addTextArea(callback?: (component: TextAreaComponent) => void): this {
    const component = new TextAreaComponent(this.controlEl)
    this.components.push(component)
    callback?.(component)
    return this
  }
  addToggle(callback?: (component: ToggleComponent) => void): this {
    const component = new ToggleComponent(this.controlEl)
    this.components.push(component)
    callback?.(component)
    return this
  }
  addDropdown(callback?: (component: DropdownComponent) => void): this {
    const component = new DropdownComponent(this.controlEl)
    this.components.push(component)
    callback?.(component)
    return this
  }
  addButton(callback?: (component: ButtonComponent) => void): this {
    const component = new ButtonComponent(this.controlEl)
    this.components.push(component)
    callback?.(component)
    return this
  }
  addExtraButton(callback?: (component: ExtraButtonComponent) => void): this {
    const component = new ExtraButtonComponent(this.controlEl)
    this.components.push(component)
    callback?.(component)
    return this
  }
  addSecret(callback?: (component: SecretComponent) => void): this {
    const component = new SecretComponent(stubEl<App>(), this.controlEl)
    this.components.push(component)
    callback?.(component)
    return this
  }
  then(callback: (setting: this) => void): this {
    callback(this)
    return this
  }
}

export class TAbstractFile {
  name = ''
  path = ''
  parent: TFolder | null = null
}

export class TFile extends TAbstractFile {
  basename = ''
  extension = ''
  stat = { ctime: 0, mtime: 0, size: 0 }
}

export class TFolder extends TAbstractFile {
  children: (TFile | TFolder)[] = []

  isRoot(): boolean {
    return this.path === '/' || this.path === ''
  }
}

export class Vault {
  adapter: unknown
  private listeners: EventRef[] = []

  constructor(adapter?: unknown) {
    this.adapter = adapter
  }

  getFiles(): TFile[] {
    return []
  }
  getMarkdownFiles(): TFile[] {
    return []
  }
  getFileByPath(_path: string): TFile | null {
    return null
  }
  getFolderByPath(_path: string): TFolder | null {
    return null
  }
  on(
    _name: string,
    _callback: (...data: unknown[]) => void,
    _ctx?: unknown,
  ): EventRef {
    const ref = {} as EventRef
    this.listeners.push(ref)
    return ref
  }
  offref(ref: EventRef): void {
    this.listeners = this.listeners.filter((candidate) => candidate !== ref)
  }
  async cachedRead(_file: TFile): Promise<string> {
    return ''
  }
  async read(_file: TFile): Promise<string> {
    return ''
  }
}

export class MarkdownView extends ItemView {
  editor: unknown = null
}

export class MarkdownFileInfo {
  file: TFile | null = null
  editor: unknown = null
}

export class Editor {
  getValue(): string {
    return ''
  }
  getSelection(): string {
    return ''
  }
  replaceSelection(_text: string): void {}
}

export class MarkdownRenderer {
  static async render(
    _app: App,
    _markdown: string,
    _el: HTMLElement,
    _sourcePath: string,
    _component: Component,
  ): Promise<void> {}

  static async renderMarkdown(
    _markdown: string,
    _el: HTMLElement,
    _sourcePath: string,
    _component: Component,
    _app?: App,
  ): Promise<void> {}
}

export class Keymap {
  static isModEvent(_event: unknown): boolean {
    return false
  }
  static isPluginInstalled(_id: string): boolean {
    return false
  }
}

export async function requestUrl(_request: unknown): Promise<{
  status: number
  text: string
  json: unknown
  arrayBuffer: ArrayBuffer
}> {
  return { status: 200, text: '', json: {}, arrayBuffer: new ArrayBuffer(0) }
}
