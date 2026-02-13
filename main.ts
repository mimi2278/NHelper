// @ts-nocheck
import { Plugin, TFile, Notice } from 'obsidian';

import {
	App,
	ItemView,
	Modal,
	Notice,
	Plugin,
	PluginSettingTab,
	Setting,
	TAbstractFile,
	TFile,
	TFolder,
	WorkspaceLeaf,
	setIcon,
} from "obsidian";

const VIEW_TYPE_NOVEL_HELPER = "novel-helper-view";

type ApiType = "anthropic" | "openai" | "google";
type QuickPromptKey = "characterSheet" | "plotAnalysis" | "brainstorming" | "beatSheet";

interface Message {
	role: "user" | "assistant";
	content: string;
}

interface Preset {
	id: number;
	name: string;
	apiType: ApiType;
	endpoint: string;
	model: string;
	apiKey: string;
	temperature: number;
	max_tokens: number;
}

interface Conversation {
	id: number;
	title: string;
	messages: Message[];
	selectedFiles: string[];
	timestamp: string;
	lastUpdated: string;
}

interface PromptTemplates {
	instruction: string;
	characterSheet: string;
	plotAnalysis: string;
	brainstorming: string;
	beatSheet: string;
}

interface NovelHelperSettings {
	presets: Preset[];
	activePresetId: number;
	conversations: Conversation[];
	selectedReferencePaths: string[];
	prompts: PromptTemplates;
}

const DEFAULT_PRESET: Preset = {
	id: 1,
	name: "기본 설정",
	apiType: "anthropic",
	endpoint: "https://api.anthropic.com/v1/messages",
	model: "claude-sonnet-4-20250514",
	apiKey: "",
	temperature: 1.0,
	max_tokens: 4096,
};

const DEFAULT_PROMPTS: PromptTemplates = {
	instruction: "",
	characterSheet: "",
	plotAnalysis: "",
	brainstorming: "",
	beatSheet: "",
};

const DEFAULT_SETTINGS: NovelHelperSettings = {
	presets: [DEFAULT_PRESET],
	activePresetId: 1,
	conversations: [],
	selectedReferencePaths: [],
	prompts: DEFAULT_PROMPTS,
};

const QUICK_ACTIONS: Array<{ key: QuickPromptKey; label: string }> = [
	{ key: "characterSheet", label: "캐릭터 시트" },
	{ key: "plotAnalysis", label: "플롯 분석" },
	{ key: "brainstorming", label: "브레인스토밍" },
	{ key: "beatSheet", label: "비트시트" },
];

export default class NovelHelperPlugin extends Plugin {
	settings: NovelHelperSettings = DEFAULT_SETTINGS;

	async onload() {
		await this.loadSettings();
		this.registerView(VIEW_TYPE_NOVEL_HELPER, (leaf) => new NovelHelperView(leaf, this));

		this.addRibbonIcon("sparkles", "Novel Helper 열기", () => {
			void this.activateView();
		});

		this.addCommand({
			id: "open-novel-helper",
			name: "Novel Helper 열기",
			callback: () => void this.activateView(),
		});

		this.addSettingTab(new NovelHelperSettingTab(this.app, this));
	}

	onunload() {
		this.app.workspace.detachLeavesOfType(VIEW_TYPE_NOVEL_HELPER);
	}

	async activateView() {
		const { workspace } = this.app;
		let leaf = workspace.getLeavesOfType(VIEW_TYPE_NOVEL_HELPER)[0] ?? null;
		if (!leaf) {
			leaf = workspace.getRightLeaf(false);
			if (leaf) await leaf.setViewState({ type: VIEW_TYPE_NOVEL_HELPER, active: true });
		}
		if (leaf) workspace.revealLeaf(leaf);
	}

	async loadSettings() {
		const loaded = await this.loadData();
		this.settings = {
			...DEFAULT_SETTINGS,
			...loaded,
			prompts: { ...DEFAULT_PROMPTS, ...(loaded?.prompts ?? {}) },
		};
		if (!this.settings.presets?.length) {
			this.settings.presets = [DEFAULT_PRESET];
			this.settings.activePresetId = DEFAULT_PRESET.id;
		}
	}

	async saveSettings() {
		await this.saveData(this.settings);
	}
}

class NovelHelperView extends ItemView {
	plugin: NovelHelperPlugin;
	messages: Message[] = [];
	loading = false;
	input = "";
	currentConversationId: number | null = null;
	selectedFiles = new Set<string>();

	constructor(leaf: WorkspaceLeaf, plugin: NovelHelperPlugin) {
		super(leaf);
		this.plugin = plugin;
	}

	getViewType() {
		return VIEW_TYPE_NOVEL_HELPER;
	}

	getDisplayText() {
		return "Novel Helper";
	}

	getIcon() {
		return "sparkles";
	}

	async onOpen() {
		this.selectedFiles = new Set(this.plugin.settings.selectedReferencePaths);
		this.render();
	}

	get activePreset(): Preset {
		return this.plugin.settings.presets.find((p) => p.id === this.plugin.settings.activePresetId) ?? this.plugin.settings.presets[0];
	}

	getPromptText(key: QuickPromptKey): string {
		return this.plugin.settings.prompts[key]?.trim() ?? "";
	}

	render() {
		const root = this.containerEl.children[1] as HTMLElement;
		root.empty();
		root.addClass("novel-helper-root");

		const top = root.createDiv({ cls: "novel-helper-topbar" });
		top.createEl("span", { text: "Novel Helper" });
		const topActions = top.createDiv({ cls: "novel-helper-row" });
		topActions.createEl("button", { text: "참고 파일 고르기" }).onclick = () => {
			new ReferencePickerModal(this.app, this.plugin, this.selectedFiles, async (selection) => {
				this.selectedFiles = new Set(selection);
				this.plugin.settings.selectedReferencePaths = [...selection];
				await this.plugin.saveSettings();
				this.render();
			}).open();
		};
		this.createIconButton(topActions, "settings", "API 설정", () => {
			new ApiConfigModal(this.app, this.plugin, () => this.render()).open();
		});

		this.renderChatSection(root);
		this.renderHistorySection(root);
	}

	createIconButton(container: HTMLElement, icon: string, label: string, onClick: () => void) {
		const btn = container.createEl("button", { cls: "novel-helper-icon-btn" });
		setIcon(btn, icon);
		btn.ariaLabel = label;
		btn.title = label;
		btn.onclick = onClick;
	}

	renderChatSection(root: HTMLElement) {
		const section = root.createDiv({ cls: "novel-helper-chat" });

		section.createEl("div", { cls: "novel-helper-instruction-title", text: "Instruction" });
		const instructionText = this.plugin.settings.prompts.instruction || "(아직 설정되지 않음)";
		section.createDiv({ cls: "novel-helper-instruction", text: instructionText });

		const messagesEl = section.createDiv({ cls: "novel-helper-messages" });
		if (this.messages.length === 0) {
			messagesEl.createDiv({ cls: "novel-helper-empty", text: "대화를 시작해보세요." });
		} else {
			for (const msg of this.messages) {
				messagesEl.createDiv({ cls: `novel-helper-msg ${msg.role}`, text: msg.content });
			}
		}

		const input = section.createEl("textarea", { cls: "novel-helper-input" });
		input.placeholder = "메시지를 입력하세요";
		input.value = this.input;
		input.disabled = this.loading;
		input.oninput = () => {
			this.input = input.value;
		};

		const sendRow = section.createDiv({ cls: "novel-helper-row" });
		const sendBtn = sendRow.createEl("button", { text: this.loading ? "생각 중..." : "전송" });
		sendBtn.disabled = this.loading;
		sendBtn.onclick = () => void this.sendMessage(this.input);

		const quickWrap = section.createDiv({ cls: "novel-helper-quick-wrap" });
		const quick = quickWrap.createDiv({ cls: "novel-helper-quick" });
		for (const action of QUICK_ACTIONS) {
			quick.createEl("button", { text: action.label }).onclick = () => {
				this.input = this.getPromptText(action.key);
				this.render();
			};
		}

		const promptEditBtn = quickWrap.createEl("button", { cls: "novel-helper-prompt-btn", text: "프롬프트..." });
		promptEditBtn.onclick = () => {
			new PromptTemplateModal(this.app, this.plugin, () => this.render()).open();
		};
	}

	renderHistorySection(root: HTMLElement) {
		const section = root.createDiv({ cls: "novel-helper-history" });
		const titleRow = section.createDiv({ cls: "novel-helper-row novel-helper-between" });
		titleRow.createEl("div", { text: `대화 히스토리 (${this.plugin.settings.conversations.length})` });
		titleRow.createEl("button", { text: "확장" }).onclick = () => {
			new HistoryModal(this.app, this).open();
		};

		const history = [...this.plugin.settings.conversations]
			.sort((a, b) => b.lastUpdated.localeCompare(a.lastUpdated))
			.slice(0, 4);
		if (!history.length) {
			section.createDiv({ cls: "novel-helper-empty", text: "저장된 대화가 없습니다." });
			return;
		}

		for (const conv of history) {
			const row = section.createDiv({ cls: "novel-helper-history-row" });
			const meta = row.createDiv({ cls: "novel-helper-history-meta" });
			meta.createEl("strong", { text: conv.title });
			meta.createDiv({ text: new Date(conv.timestamp).toLocaleDateString("ko-KR") });
			meta.onclick = () => this.loadConversation(conv.id);
		}
	}

	loadConversation(id: number) {
		const conv = this.plugin.settings.conversations.find((c) => c.id === id);
		if (!conv) return;
		this.currentConversationId = conv.id;
		this.messages = [...conv.messages];
		this.selectedFiles = new Set(conv.selectedFiles);
		this.render();
	}

	async saveConversation() {
		if (!this.messages.length) return;
		const id = this.currentConversationId ?? Date.now();
		const title = `${this.messages[0]?.content.slice(0, 30) ?? "새 대화"}...`;
		const conversation: Conversation = {
			id,
			title,
			messages: [...this.messages],
			selectedFiles: [...this.selectedFiles],
			timestamp: new Date().toISOString(),
			lastUpdated: new Date().toISOString(),
		};
		this.plugin.settings.conversations = this.currentConversationId
			? this.plugin.settings.conversations.map((c) => (c.id === id ? conversation : c))
			: [conversation, ...this.plugin.settings.conversations];
		this.currentConversationId = id;
		await this.plugin.saveSettings();
	}

	async readSelectedFiles(): Promise<Array<{ name: string; content: string }>> {
		const results: Array<{ name: string; content: string }> = [];
		for (const path of this.selectedFiles) {
			const file = this.app.vault.getAbstractFileByPath(path);
			if (file instanceof TFile) {
				results.push({ name: path, content: await this.app.vault.read(file) });
			}
		}
		return results;
	}

	async sendMessage(rawInput: string) {
		if (!rawInput.trim()) return;
		const preset = this.activePreset;
		if (!preset?.apiKey) {
			new Notice("API 키를 먼저 설정해주세요.");
			return;
		}

		const userMessage: Message = { role: "user", content: rawInput.trim() };
		this.messages.push(userMessage);
		this.input = "";
		this.loading = true;
		this.render();

		try {
			const fileContents = await this.readSelectedFiles();
			const request = this.buildRequest(preset, fileContents, userMessage);
			const response = await fetch(request.endpoint, {
				method: "POST",
				headers: request.headers,
				body: request.body,
			});
			if (!response.ok) throw new Error(`API 오류 (${response.status}): ${await response.text()}`);
			const data = await response.json();
			this.messages.push({ role: "assistant", content: this.parseResponse(preset.apiType, data) });
			await this.saveConversation();
		} catch (error) {
			const message = error instanceof Error ? error.message : "알 수 없는 오류";
			this.messages.push({ role: "assistant", content: `오류가 발생했습니다: ${message}` });
		} finally {
			this.loading = false;
			this.render();
		}
	}

	buildRequest(preset: Preset, fileContents: Array<{ name: string; content: string }>, userMessage: Message) {
		let systemPrompt = this.plugin.settings.prompts.instruction || "당신은 소설 작가를 돕는 창작 어시스턴트입니다.";
		if (fileContents.length > 0) {
			systemPrompt += "\n\n현재 참고 중인 소설 자료:\n\n";
			for (const file of fileContents) {
				systemPrompt += `=== ${file.name} ===\n${file.content}\n\n`;
			}
		}

		const conversationMessages = [...this.messages.filter((m) => m !== userMessage), userMessage];

		if (preset.apiType === "anthropic") {
			return {
				endpoint: preset.endpoint,
				headers: {
					"Content-Type": "application/json",
					"x-api-key": preset.apiKey,
					"anthropic-version": "2023-06-01",
				},
				body: JSON.stringify({
					model: preset.model,
					max_tokens: preset.max_tokens,
					temperature: preset.temperature,
					system: systemPrompt,
					messages: conversationMessages,
				}),
			};
		}

		if (preset.apiType === "openai") {
			return {
				endpoint: preset.endpoint,
				headers: {
					"Content-Type": "application/json",
					Authorization: `Bearer ${preset.apiKey}`,
				},
				body: JSON.stringify({
					model: preset.model,
					max_tokens: preset.max_tokens,
					temperature: preset.temperature,
					messages: [{ role: "system", content: systemPrompt }, ...conversationMessages],
				}),
			};
		}

		let endpoint = preset.endpoint;
		if (!endpoint.includes(":generateContent")) {
			endpoint = endpoint.includes("/models/")
				? `${endpoint}${preset.model}:generateContent`
				: `${endpoint}/models/${preset.model}:generateContent`;
		}

		const contents = conversationMessages.map((m, index) => ({
			role: m.role === "assistant" ? "model" : "user",
			parts: [{ text: index === 0 ? `${systemPrompt}\n\n${m.content}` : m.content }],
		}));

		return {
			endpoint: `${endpoint}?key=${preset.apiKey}`,
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({
				contents,
				generationConfig: {
					temperature: preset.temperature,
					maxOutputTokens: preset.max_tokens,
				},
			}),
		};
	}

	parseResponse(apiType: ApiType, data: unknown): string {
		const payload = data as any;
		if (apiType === "anthropic") return payload?.content?.[0]?.text ?? "응답 파싱 실패";
		if (apiType === "openai") return payload?.choices?.[0]?.message?.content ?? "응답 파싱 실패";
		return payload?.candidates?.[0]?.content?.parts?.[0]?.text ?? "응답 파싱 실패";
	}
}

class ReferencePickerModal extends Modal {
	plugin: NovelHelperPlugin;
	tempSelected: Set<string>;
	onApply: (selection: Set<string>) => Promise<void>;

	constructor(app: App, plugin: NovelHelperPlugin, selected: Set<string>, onApply: (selection: Set<string>) => Promise<void>) {
		super(app);
		this.plugin = plugin;
		this.tempSelected = new Set(selected);
		this.onApply = onApply;
	}

	onOpen() {
		this.modalEl.addClass("novel-helper-ref-modal");
		const { contentEl } = this;
		contentEl.empty();
		contentEl.createEl("h3", { text: "참고 파일 고르기" });
		contentEl.createEl("p", { text: "폴더 선택 시 해당 하위의 모든 md 파일이 함께 선택됩니다." });

		const tree = contentEl.createDiv({ cls: "novel-helper-tree" });
		this.renderNode(tree, this.app.vault.getRoot(), 0);

		const actions = contentEl.createDiv({ cls: "novel-helper-row" });
		actions.createEl("button", { text: "선택 초기화" }).onclick = () => {
			this.tempSelected.clear();
			this.onOpen();
		};
		actions.createEl("button", { text: "적용 / 저장" }).onclick = async () => {
			await this.onApply(new Set(this.tempSelected));
			new Notice(`참고 파일 ${this.tempSelected.size}개 저장됨`);
			this.close();
		};
	}

	renderNode(container: HTMLElement, node: TAbstractFile, depth: number) {
		if (node instanceof TFile) {
			if (!node.path.endsWith(".md")) return;
			const row = container.createDiv({ cls: "novel-helper-tree-row" });
			row.style.paddingLeft = `${depth * 14}px`;
			const cb = row.createEl("input", { type: "checkbox" });
			cb.checked = this.tempSelected.has(node.path);
			cb.onchange = () => {
				if (cb.checked) this.tempSelected.add(node.path);
				else this.tempSelected.delete(node.path);
			};
			row.createSpan({ text: node.path });
			return;
		}

		if (node instanceof TFolder) {
			const childMd = this.getMarkdownFilesInFolder(node).map((f) => f.path);
			const checked = childMd.length > 0 && childMd.every((p) => this.tempSelected.has(p));
			const details = container.createEl("details", { cls: "novel-helper-tree-folder" });
			details.open = depth < 2;
			const summary = details.createEl("summary");
			summary.style.marginLeft = `${depth * 14}px`;
			const cb = summary.createEl("input", { type: "checkbox" });
			cb.checked = checked;
			cb.onchange = () => {
				for (const path of childMd) {
					if (cb.checked) this.tempSelected.add(path);
					else this.tempSelected.delete(path);
				}
				this.onOpen();
			};
			summary.createSpan({ text: node.path || "(root)" });

			for (const child of node.children) {
				this.renderNode(details, child, depth + 1);
			}
		}
	}

	getMarkdownFilesInFolder(folder: TFolder): TFile[] {
		const results: TFile[] = [];
		for (const child of folder.children) {
			if (child instanceof TFile && child.path.endsWith(".md")) results.push(child);
			if (child instanceof TFolder) results.push(...this.getMarkdownFilesInFolder(child));
		}
		return results;
	}
}

class HistoryModal extends Modal {
	view: NovelHelperView;

	constructor(app: App, view: NovelHelperView) {
		super(app);
		this.view = view;
	}

	onOpen() {
		this.modalEl.addClass("novel-helper-history-modal");
		const { contentEl } = this;
		contentEl.empty();
		contentEl.createEl("h3", { text: "대화 히스토리 (확장)" });

		const history = [...this.view.plugin.settings.conversations].sort((a, b) => b.lastUpdated.localeCompare(a.lastUpdated));
		if (!history.length) {
			contentEl.createDiv({ cls: "novel-helper-empty", text: "저장된 대화가 없습니다." });
			return;
		}

		for (const conv of history) {
			const row = contentEl.createDiv({ cls: "novel-helper-history-row" });
			const meta = row.createDiv({ cls: "novel-helper-history-meta" });
			meta.createEl("strong", { text: conv.title });
			meta.createDiv({ text: new Date(conv.timestamp).toLocaleString("ko-KR") });
			meta.onclick = () => {
				this.view.loadConversation(conv.id);
				this.close();
			};
		}
	}
}

class PromptTemplateModal extends Modal {
	plugin: NovelHelperPlugin;
	onSaved: () => void;

	constructor(app: App, plugin: NovelHelperPlugin, onSaved: () => void) {
		super(app);
		this.plugin = plugin;
		this.onSaved = onSaved;
	}

	onOpen() {
		this.modalEl.addClass("novel-helper-prompt-modal");
		const { contentEl } = this;
		contentEl.empty();
		contentEl.createEl("h3", { text: "프롬프트 편집" });

		new Setting(contentEl).setName("Instruction").addTextArea((text) => {
			text.setValue(this.plugin.settings.prompts.instruction);
			text.onChange((v) => (this.plugin.settings.prompts.instruction = v));
		});
		for (const action of QUICK_ACTIONS) {
			new Setting(contentEl).setName(action.label).addTextArea((text) => {
				text.setValue(this.plugin.settings.prompts[action.key]);
				text.onChange((v) => (this.plugin.settings.prompts[action.key] = v));
			});
		}

		new Setting(contentEl).addButton((btn) =>
			btn.setButtonText("저장").setCta().onClick(async () => {
				await this.plugin.saveSettings();
				new Notice("프롬프트 저장 완료");
				this.onSaved();
				this.close();
			}),
		);
	}
}

class ApiConfigModal extends Modal {
	plugin: NovelHelperPlugin;
	onSaved: () => void;

	constructor(app: App, plugin: NovelHelperPlugin, onSaved: () => void) {
		super(app);
		this.plugin = plugin;
		this.onSaved = onSaved;
	}

	onOpen() {
		this.modalEl.addClass("novel-helper-api-modal");
		const { contentEl } = this;
		contentEl.empty();
		contentEl.createEl("h3", { text: "API 설정" });

		new Setting(contentEl).setName("활성 프리셋").addDropdown((dropdown) => {
			for (const p of this.plugin.settings.presets) dropdown.addOption(String(p.id), p.name);
			dropdown.setValue(String(this.plugin.settings.activePresetId));
			dropdown.onChange(async (v) => {
				this.plugin.settings.activePresetId = Number(v);
				await this.plugin.saveSettings();
				this.onOpen();
			});
		});

		const preset = this.plugin.settings.presets.find((p) => p.id === this.plugin.settings.activePresetId);
		if (!preset) return;

		new Setting(contentEl).setName("프리셋 이름").addText((t) => t.setValue(preset.name).onChange((v) => (preset.name = v)));
		new Setting(contentEl).setName("API 타입").addDropdown((d) => {
			d.addOption("anthropic", "Anthropic");
			d.addOption("openai", "OpenAI");
			d.addOption("google", "Google Gemini");
			d.setValue(preset.apiType);
			d.onChange((v: ApiType) => (preset.apiType = v));
		});
		new Setting(contentEl).setName("Endpoint").addText((t) => t.setValue(preset.endpoint).onChange((v) => (preset.endpoint = v)));
		new Setting(contentEl).setName("Model").addText((t) => t.setValue(preset.model).onChange((v) => (preset.model = v)));
		new Setting(contentEl).setName("API Key").addText((t) => t.setValue(preset.apiKey).onChange((v) => (preset.apiKey = v)));

		new Setting(contentEl)
			.setName("프리셋 관리")
			.addButton((b) =>
				b.setButtonText("저장").setCta().onClick(async () => {
					await this.plugin.saveSettings();
					new Notice("API 설정 저장 완료");
					this.onSaved();
				}),
			)
			.addExtraButton((b) =>
				b.setIcon("plus").setTooltip("추가").onClick(async () => {
					const newId = Math.max(...this.plugin.settings.presets.map((p) => p.id), 0) + 1;
					this.plugin.settings.presets.push({ ...DEFAULT_PRESET, id: newId, name: `프리셋 ${newId}` });
					this.plugin.settings.activePresetId = newId;
					await this.plugin.saveSettings();
					this.onOpen();
				}),
			)
			.addExtraButton((b) =>
				b.setIcon("trash").setTooltip("삭제").onClick(async () => {
					if (this.plugin.settings.presets.length <= 1) {
						new Notice("최소 1개의 프리셋은 필요합니다.");
						return;
					}
					this.plugin.settings.presets = this.plugin.settings.presets.filter((p) => p.id !== preset.id);
					this.plugin.settings.activePresetId = this.plugin.settings.presets[0].id;
					await this.plugin.saveSettings();
					this.onOpen();
				}),
			);
	}
}

class NovelHelperSettingTab extends PluginSettingTab {
	plugin: NovelHelperPlugin;

	constructor(app: App, plugin: NovelHelperPlugin) {
		super(app, plugin);
		this.plugin = plugin;
	}

	display(): void {
		const { containerEl } = this;
		containerEl.empty();
		containerEl.createEl("h2", { text: "Novel Helper 설정" });
		containerEl.createEl("p", { text: "주요 설정은 플러그인 뷰 내 버튼(참고 파일 고르기, 톱니, 프롬프트...)에서 관리합니다." });
	}
}
