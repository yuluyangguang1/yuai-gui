# CC-Switch 配置系统完整分析

> Agent 配置注入 · Provider 管理 · 模型支持
> 2026-06-27

---

## 一、cc-switch 数据库结构

**位置:** `data/.cc-switch/cc-switch.db` (SQLite)

### 表: `providers`

| 列 | 类型 | 说明 |
|----|------|------|
| id | TEXT PK | 唯一 ID |
| app_type | TEXT | Agent 类型: claude/codex/openai/custom |
| name | TEXT | 显示名称 |
| settings_config | TEXT | JSON 配置 |
| is_current | BOOLEAN | 是否为当前活跃 Provider |
| sort_index | INTEGER | 排序 |
| created_at | INTEGER | 时间戳 |

### settings_config JSON 结构

**claude:**
```json
{
  "env": {
    "ANTHROPIC_BASE_URL": "https://api.anthropic.com",
    "ANTHROPIC_API_KEY": "sk-ant-...",
    "ANTHROPIC_MODEL": "claude-sonnet-4"
  }
}
```

**codex:**
```json
{
  "auth": { "OPENAI_API_KEY": "sk-..." },
  "config": "model_provider = \"custom\"\nmodel = \"gpt-5.4\"\n\n[model_providers.custom]\nname = \"Custom\"\nbase_url = \"https://api.openai.com/v1\"\nwire_api = \"responses\"\nenv_key = \"OPENAI_API_KEY\""
}
```

**openai_env (openclaw/hermes):**
```json
{
  "env": {
    "OPENAI_BASE_URL": "https://...",
    "OPENAI_API_KEY": "sk-..."
  }
}
```

---

## 二、Agent 配置注入

### claude (梅) — anthropic_env

环境变量:
```
ANTHROPIC_BASE_URL = provider.base_url
ANTHROPIC_API_KEY  = provider.api_key
ANTHROPIC_MODEL    = provider.model
```

**注意:** base_url 不含 `/v1` 后缀

### codex (兰) — codex_toml

文件写入:
- `~/.codex/auth.json`: `{ "OPENAI_API_KEY": "..." }`
- `~/.codex/config.toml`:
  ```toml
  model_provider = "custom"
  model = "gpt-5.4"
  
  [model_providers.custom]
  name = "Custom"
  base_url = "https://api.openai.com/v1"
  wire_api = "responses"
  env_key = "OPENAI_API_KEY"
  ```

### openclaw (竹) — openai_env

环境变量:
```
OPENAI_BASE_URL = provider.base_url
OPENAI_API_KEY  = provider.api_key
```

**问题:** 无 model 注入

### hermes (菊) — openai_env

环境变量:
```
OPENAI_BASE_URL = provider.base_url
OPENAI_API_KEY  = provider.api_key
```

**问题:** 无 model 注入

---

## 三、Hermes Studio Provider 预设

| Provider | Pool Key | API Key Env | Base URL |
|----------|----------|-------------|----------|
| Anthropic | anthropic | ANTHROPIC_API_KEY | api.anthropic.com |
| OpenAI | openai-api | OPENAI_API_KEY | api.openai.com |
| DeepSeek | deepseek | DEEPSEEK_API_KEY | api.deepseek.com |
| Xiaomi MiMo | xiaomi | XIAOMI_API_KEY | api.xiaomimimo.com |
| Google Gemini | gemini | GEMINI_API_KEY | generativelanguage.googleapis.com |
| Kimi | kimi-coding | KIMI_API_KEY | api.moonshot.cn |
| GLM | zai | GLM_API_KEY | open.bigmodel.cn |
| Alibaba | alibaba | DASHSCOPE_API_KEY | dashscope.aliyuncs.com |
| MiniMax | minimax | MINIMAX_API_KEY | api.minimax.chat |
| xAI | xai | XAI_API_KEY | api.x.ai |

### API 模式

| 模式 | 说明 |
|------|------|
| chat_completions | OpenAI 兼容 |
| codex_responses | OpenAI Responses API |
| anthropic_messages | Anthropic Messages API |
| bedrock_converse | AWS Bedrock |

---

## 四、当前问题

1. **openai_env 无 model 注入** — openclaw/hermes 不知道用哪个模型
2. **codex 写入全局目录** — 多 provider 会互相覆盖
3. **无 URL 格式校验** — Anthropic 不要 /v1，OpenAI 要 /v1
4. **无 provider 预设** — 需要手动填写所有信息
5. **settings_config 解析脆弱** — 字符串分割容易出错

---

## 五、改进方案

1. **添加 OPENAI_MODEL 环境变量** — openai_env 也注入 model
2. **codex 配置作用域** — 用 CODEX_HOME 隔离
3. **URL 格式化** — 自动补全/去除 /v1
4. **Provider 预设** — 内置 10+ 常用 Provider
5. **统一配置格式** — 参考 Hermes Studio 的 config.yaml 模式
