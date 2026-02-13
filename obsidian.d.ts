declare module "obsidian" {
  export class App {
    vault: any;
    workspace: any;
  }
  export class Plugin {
    app: App;
    addRibbonIcon(icon: string, title: string, callback: () => void): void;
    addCommand(command: { id: string; name: string; callback: () => void }): void;
    addSettingTab(tab: any): void;
    registerView(type: string, callback: (leaf: any) => any): void;
    loadData(): Promise<any>;
    saveData(data: any): Promise<void>;
  }
  export class WorkspaceLeaf {
    setViewState(state: any): Promise<void>;
  }
  export class ItemView {
    app: App;
    containerEl: HTMLElement;
    constructor(leaf: WorkspaceLeaf);
  }
  export class Modal {
    app: App;
    modalEl: HTMLElement;
    contentEl: HTMLElement;
    constructor(app: App);
    open(): void;
    close(): void;
  }
  export class Notice {
    constructor(message: string);
  }
  export class PluginSettingTab {
    containerEl: HTMLElement;
    constructor(app: App, plugin: Plugin);
  }
  export class Setting {
    constructor(containerEl: HTMLElement);
    setName(name: string): this;
    setDesc(desc: string): this;
    addButton(cb: (button: any) => any): this;
    addExtraButton(cb: (button: any) => any): this;
    addDropdown(cb: (dropdown: any) => any): this;
    addText(cb: (text: any) => any): this;
    addTextArea(cb: (text: any) => any): this;
  }
  export class TAbstractFile { path: string; }
  export class TFile extends TAbstractFile {}
  export class TFolder extends TAbstractFile { children: TAbstractFile[]; }
  export function setIcon(el: HTMLElement, icon: string): void;
}
