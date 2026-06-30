#!/usr/bin/env node
/**
 * 解析 agency-agents，生成精简索引 + 内容文件分离
 */

import { readFileSync, writeFileSync, readdirSync, statSync, mkdirSync } from 'fs'
import { join, basename } from 'path'

const sourceDir = process.argv[2]
const outputDir = process.argv[3] || 'src/data/agency'

if (!sourceDir) {
  console.error('Usage: node parse-agency-agents.mjs <source-dir> [output-dir]')
  process.exit(1)
}

mkdirSync(outputDir, { recursive: true })

function parseFrontmatter(content) {
  const match = content.match(/^---\n([\s\S]*?)\n---/)
  if (!match) return {}
  const yaml = match[1]
  const result = {}
  for (const line of yaml.split('\n')) {
    const colonIndex = line.indexOf(':')
    if (colonIndex === -1) continue
    const key = line.slice(0, colonIndex).trim()
    const value = line.slice(colonIndex + 1).trim()
    result[key] = value
  }
  return result
}

function getBody(content) {
  const match = content.match(/^---\n[\s\S]*?\n---\n([\s\S]*)$/)
  return match ? match[1].trim() : content.trim()
}

function findMdFiles(dir) {
  const results = []
  const entries = readdirSync(dir)
  for (const entry of entries) {
    const fullPath = join(dir, entry)
    const stat = statSync(fullPath)
    if (stat.isDirectory()) {
      if (['scripts', 'integrations', 'examples', '.git'].includes(entry)) continue
      results.push(...findMdFiles(fullPath))
    } else if (entry.endsWith('.md') && entry !== 'README.md' && entry !== 'CONTRIBUTING.md') {
      results.push(fullPath)
    }
  }
  return results
}

const divisionLabels = {
  academic: '学术研究', design: '设计', engineering: '工程开发',
  finance: '财务', 'game-development': '游戏开发', gis: '地理信息',
  marketing: '市场营销', 'paid-media': '付费媒体', product: '产品',
  'project-management': '项目管理', sales: '销售', security: '安全',
  'spatial-computing': '空间计算', specialized: '专业服务', strategy: '战略',
  support: '技术支持', testing: '测试',
}

const files = findMdFiles(sourceDir)
const agents = []
const divisionCounts = {}

for (const file of files) {
  try {
    const content = readFileSync(file, 'utf-8')
    const frontmatter = parseFrontmatter(content)
    const body = getBody(content)
    const relativePath = file.replace(sourceDir + '/', '')
    const division = relativePath.split('/')[0]
    if (!frontmatter.name) continue

    const id = basename(file, '.md')

    // 写入内容文件（按需加载）
    const contentFile = join(outputDir, `${id}.md`)
    writeFileSync(contentFile, body.slice(0, 6000))

    agents.push({
      id,
      name: frontmatter.name || id,
      desc: (frontmatter.description || '').slice(0, 200),
      div: division,
      color: frontmatter.color || 'gray',
      emoji: frontmatter.emoji || '🤖',
      vibe: (frontmatter.vibe || '').slice(0, 100),
    })

    divisionCounts[division] = (divisionCounts[division] || 0) + 1
  } catch (e) {
    console.error(`Error: ${file}: ${e.message}`)
  }
}

const divisions = Object.entries(divisionCounts)
  .map(([id, count]) => ({ id, label: divisionLabels[id] || id, count }))
  .sort((a, b) => b.count - a.count)

const index = { agents, divisions, total: agents.length }
writeFileSync(join(outputDir, 'index.json'), JSON.stringify(index))
console.log(`Done: ${agents.length} agents, ${divisions.length} divisions`)
console.log(`Index: ${join(outputDir, 'index.json')}`)
console.log(`Content: ${outputDir}/*.md`)
