/**
 * 多格式导出系统
 * 参考 agency-agents 的多格式输出
 * 一个 Agent 人格 → 14 种工具格式
 */

export type ExportFormat = 'claude-code' | 'cursor' | 'codex' | 'hermes' | 'openclaw' | 'aider' | 'windsurf' | 'markdown'

export interface ExportConfig {
  format: ExportFormat
  agentId: string
  agentName: string
  agentContent: string
  outputPath?: string
}

/**
 * 格式转换器
 */
export class FormatExporter {
  /** 导出为指定格式 */
  export(config: ExportConfig): string {
    switch (config.format) {
      case 'claude-code':
        return this.exportClaudeCode(config)
      case 'cursor':
        return this.exportCursor(config)
      case 'codex':
        return this.exportCodex(config)
      case 'hermes':
        return this.exportHermes(config)
      case 'openclaw':
        return this.exportOpenClaw(config)
      case 'aider':
        return this.exportAider(config)
      case 'windsurf':
        return this.exportWindsurf(config)
      case 'markdown':
        return this.exportMarkdown(config)
      default:
        return config.agentContent
    }
  }

  /** Claude Code 格式 */
  private exportClaudeCode(config: ExportConfig): string {
    return `# ${config.agentName}\n\n${config.agentContent}`
  }

  /** Cursor 格式 (.mdc) */
  private exportCursor(config: ExportConfig): string {
    return `---
description: ${config.agentName}
globs: []
alwaysApply: false
---

${config.agentContent}`
  }

  /** Codex 格式 (.toml) */
  private exportCodex(config: ExportConfig): string {
    return `[agent]
name = "${config.agentName}"
description = "${config.agentName} agent"

[instructions]
content = """
${config.agentContent}
"""`
  }

  /** Hermes 格式 (SKILL.md) */
  private exportHermes(config: ExportConfig): string {
    return `---
name: ${config.agentId}
description: ${config.agentName}
---

# ${config.agentName}

${config.agentContent}`
  }

  /** OpenClaw 格式 (SOUL.md) */
  private exportOpenClaw(config: ExportConfig): string {
    return `# ${config.agentName}

## Identity
${config.agentContent}

## Instructions
Follow the identity and instructions above.`
  }

  /** Aider 格式 (CONVENTIONS.md) */
  private exportAider(config: ExportConfig): string {
    return `# ${config.agentName} Conventions

${config.agentContent}`
  }

  /** Windsurf 格式 (.windsurfrules) */
  private exportWindsurf(config: ExportConfig): string {
    return `# ${config.agentName}

${config.agentContent}`
  }

  /** Markdown 格式 */
  private exportMarkdown(config: ExportConfig): string {
    return `# ${config.agentName}\n\n${config.agentContent}`
  }

  /** 获取所有支持的格式 */
  getSupportedFormats(): ExportFormat[] {
    return ['claude-code', 'cursor', 'codex', 'hermes', 'openclaw', 'aider', 'windsurf', 'markdown']
  }

  /** 获取格式描述 */
  getFormatDescription(format: ExportFormat): string {
    const descriptions: Record<ExportFormat, string> = {
      'claude-code': 'Claude Code (.md)',
      'cursor': 'Cursor (.mdc)',
      'codex': 'Codex (.toml)',
      'hermes': 'Hermes (SKILL.md)',
      'openclaw': 'OpenClaw (SOUL.md)',
      'aider': 'Aider (CONVENTIONS.md)',
      'windsurf': 'Windsurf (.windsurfrules)',
      'markdown': 'Markdown (.md)',
    }
    return descriptions[format] ?? format
  }
}

// 全局格式导出器实例
export const globalFormatExporter = new FormatExporter()
