/**
 * 提示词 Pinia Store
 * 管理 slash commands、模板、最近使用
 */
import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { BUILT_IN_COMMANDS, type SlashCommand } from '../utils/slash-commands'
import { renderTemplate, getUnresolvedVariables, getAutoContext } from '../utils/template-engine'

export const usePromptStore = defineStore('prompt', () => {
  // ── 状态 ──
  const commands = ref<SlashCommand[]>([...BUILT_IN_COMMANDS])
  const recentCommandIds = ref<string[]>([])
  const customTemplates = ref<SlashCommand[]>([])

  // ── 计算属性 ──
  const allCommands = computed(() => [...commands.value, ...customTemplates.value])

  const recentCommands = computed(() => {
    return recentCommandIds.value
      .map(id => allCommands.value.find(c => c.id === id))
      .filter(Boolean) as SlashCommand[]
  })

  const commandsByCategory = computed(() => {
    const categories: Record<string, SlashCommand[]> = {}
    for (const cmd of allCommands.value) {
      if (!categories[cmd.category]) categories[cmd.category] = []
      categories[cmd.category].push(cmd)
    }
    return categories
  })

  // ── 检测 slash trigger ──
  function detectSlashTrigger(text: string, cursorPos: number): { command: string; startIndex: number } | null {
    const beforeCursor = text.slice(0, cursorPos)
    const match = beforeCursor.match(/(?:^|\s)\/(\w*)$/)
    if (match) {
      return {
        command: match[1],
        startIndex: beforeCursor.lastIndexOf('/'),
      }
    }
    return null
  }

  // ── 过滤命令 ──
  function filterCommands(query: string): SlashCommand[] {
    if (!query) return allCommands.value
    const q = query.toLowerCase()
    return allCommands.value.filter(
      c => c.name.includes(q) || c.description.includes(q) || c.category.includes(q)
    )
  }

  // ── 执行命令 ──
  async function executeCommand(commandId: string, userInputs?: Record<string, string>): Promise<{
    text: string
    needsInput: Array<{ name: string; description: string; default?: string }>
  } | null> {
    const command = allCommands.value.find(c => c.id === commandId)
    if (!command) return null

    // 记录最近使用
    recentCommandIds.value = [
      commandId,
      ...recentCommandIds.value.filter(id => id !== commandId),
    ].slice(0, 10)

    // 保存到 localStorage
    try {
      localStorage.setItem('yuai-recent-commands', JSON.stringify(recentCommandIds.value))
    } catch {
      // ignore
    }

    // 获取自动上下文
    const context = await getAutoContext()

    // 合并用户输入
    if (userInputs) {
      Object.assign(context, userInputs)
    }

    // 渲染模板
    const rendered = renderTemplate(command.template, context)
    const unresolved = getUnresolvedVariables(command.template, context)

    if (unresolved.length > 0) {
      return {
        text: rendered,
        needsInput: unresolved.map(v => ({
          name: v.name,
          description: command.variables?.find(vd => vd.name === v.name)?.description ?? v.name,
          default: command.variables?.find(vd => vd.name === v.name)?.default,
        })),
      }
    }

    return { text: rendered, needsInput: [] }
  }

  // ── 加载自定义模板 ──
  function loadCustomTemplates() {
    try {
      const saved = localStorage.getItem('yuai-custom-prompts')
      if (saved) {
        customTemplates.value = JSON.parse(saved)
      }
    } catch {
      // ignore
    }
  }

  // ── 保存自定义模板 ──
  function saveCustomTemplates() {
    try {
      localStorage.setItem('yuai-custom-prompts', JSON.stringify(customTemplates.value))
    } catch {
      // ignore
    }
  }

  // ── 添加自定义模板 ──
  function addCustomTemplate(template: SlashCommand) {
    customTemplates.value.push(template)
    saveCustomTemplates()
  }

  // ── 删除自定义模板 ──
  function removeCustomTemplate(id: string) {
    customTemplates.value = customTemplates.value.filter(t => t.id !== id)
    saveCustomTemplates()
  }

  // ── 初始化 ──
  function init() {
    loadCustomTemplates()
    try {
      const saved = localStorage.getItem('yuai-recent-commands')
      if (saved) {
        recentCommandIds.value = JSON.parse(saved)
      }
    } catch {
      // ignore
    }
  }

  init()

  return {
    commands,
    allCommands,
    recentCommands,
    commandsByCategory,
    customTemplates,
    detectSlashTrigger,
    filterCommands,
    executeCommand,
    addCustomTemplate,
    removeCustomTemplate,
  }
})
