# WorkItem — SafeStorage中央Vault接口开发
状态：pending
标签：6-mcp 前置

## 目标
替代或加强当前 API 凭据的明文存放，做 hosts 级密钥统一派生 API。

## 已落地点
- `src/components/WorkflowEditor.vue`：Flow DSL 编辑器主体已接入
- `src/components/workflow/WorkflowNode.vue`：四类节点 + Handles 视觉
- `src/components/workflow/nodeTypes.ts`：VueFlow 注册表
- `src/components/workflow/engine.ts`：拓扑执行 + 状态调度
- `src/stores/workflow.ts`：undo/redo、snapshot、schemaVersion、validateStructure/validateExecutable
- `src-tauri/src/lib.rs`：mod/invoke 注册 (待编译)
- `src-tauri/src/secure.rs`：AES-256-GCM sealed box (待编译)
- `src-tauri/Cargo.toml`：新增 aes-gcm/rand/zeroize (待编译)

## 阻塞原因
当前环境 `cargo check` 持续超时，无法完成 Rust 编译验证。

## 依赖
- src-tauri Rust 编译恢复
- 前端 SecureStorageService + SettingsPanel 不侵入 keyring 配置
