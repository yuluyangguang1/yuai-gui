<template>
  <div class="spec-panel" role="region" aria-label="规格驱动">
    <h2 class="spec-title">Spec-Driven</h2>

    <!-- Phase indicator -->
    <div class="spec-phases">
      <span v-for="p in phases" :key="p.id" class="phase-step" :class="{ active: currentPhase === p.id, done: phaseIndex > phases.indexOf(p) }">
        <TIcon :name="p.icon" :size="12" />
        <span class="phase-label">{{ p.label }}</span>
      </span>
    </div>

    <!-- Constitution -->
    <div v-if="currentPhase === 'constitution'" class="spec-section">
      <h3 class="section-title"><TIcon name="shield" :size="14" /> 项目宪法</h3>
      <div class="constitution-list">
        <div v-for="p in constitutionPrinciples" :key="p.id" class="principle-item">
          <span class="principle-severity" :class="'sev-' + p.severity">{{ p.severity }}</span>
          <span class="principle-title">{{ p.title }}</span>
        </div>
      </div>
      <button class="spec-btn" @click="nextPhase">
        <TIcon name="arrowRight" :size="14" /> 继续: 定义规格
      </button>
    </div>

    <!-- Specify -->
    <div v-if="currentPhase === 'specify'" class="spec-section">
      <h3 class="section-title"><TIcon name="fileText" :size="14" /> 功能规格</h3>
      <textarea v-model="specContent" class="spec-textarea" placeholder="描述你要构建的功能...&#10;&#10;支持格式:&#10;- 用户故事 (P1/P2/P3)&#10;- 功能需求 (FR-001)&#10;- 成功标准 (SC-001)"></textarea>
      <button class="spec-btn" @click="nextPhase">
        <TIcon name="arrowRight" :size="14" /> 继续: 制定计划
      </button>
    </div>

    <!-- Plan -->
    <div v-if="currentPhase === 'plan'" class="spec-section">
      <h3 class="section-title"><TIcon name="map" :size="14" /> 实现计划</h3>
      <textarea v-model="planContent" class="spec-textarea" placeholder="技术栈、架构、数据模型..."></textarea>
      <button class="spec-btn" @click="nextPhase">
        <TIcon name="arrowRight" :size="14" /> 继续: 任务分解
      </button>
    </div>

    <!-- Tasks -->
    <div v-if="currentPhase === 'tasks'" class="spec-section">
      <h3 class="section-title"><TIcon name="checklist" :size="14" /> 任务分解</h3>
      <div class="task-list">
        <div v-for="task in specTasks" :key="task.id" class="spec-task">
          <input type="checkbox" :checked="task.implemented" @change="toggleTask(task.id)" />
          <span :class="{ done: task.implemented }">{{ task.description }}</span>
          <span v-if="task.parallel" class="task-parallel">[P]</span>
        </div>
      </div>
      <button class="spec-btn" @click="nextPhase">
        <TIcon name="arrowRight" :size="14" /> 继续: 实现
      </button>
    </div>

    <!-- Converge -->
    <div v-if="currentPhase === 'converge'" class="spec-section">
      <h3 class="section-title"><TIcon name="gitCompare" :size="14" /> Convergence</h3>
      <div class="converge-result">
        <div v-if="convergeResult.missing.length" class="converge-item">
          <TIcon name="alertTriangle" :size="14" /> 缺失: {{ convergeResult.missing.length }} 项
        </div>
        <div v-if="convergeResult.violations.length" class="converge-item">
          <TIcon name="shieldX" :size="14" /> 违反: {{ convergeResult.violations.length }} 项
        </div>
        <div v-if="!convergeResult.missing.length && !convergeResult.violations.length" class="converge-ok">
          <TIcon name="check" :size="14" /> 全部通过
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue';
import { TIcon } from '../utils/icons';
import { SpecEngine, type SpecPhase } from '../utils/spec-engine';
import { ConstitutionManager, YUAI_CONSTITUTION } from '../utils/constitution';

const specEngine = new SpecEngine();
const constitutionManager = new ConstitutionManager();
constitutionManager.initYuai();

const phases = [
  { id: 'constitution', label: '宪法', icon: 'shield' },
  { id: 'specify', label: '规格', icon: 'fileText' },
  { id: 'plan', label: '计划', icon: 'map' },
  { id: 'tasks', label: '任务', icon: 'checklist' },
  { id: 'converge', label: '收敛', icon: 'gitCompare' },
];

const currentPhase = ref<SpecPhase>('constitution');
const phaseIndex = computed(() => phases.findIndex(p => p.id === currentPhase.value));

const specContent = ref('');
const planContent = ref('');

const constitutionPrinciples = computed(() => {
  const c = constitutionManager.get('yuai');
  return c?.principles ?? [];
});

const specTasks = computed(() => {
  const project = specEngine.getAllProjects()[0];
  if (!project?.tasks) return [];
  return project.tasks.phases.flatMap(p => p.tasks);
});

const convergeResult = computed(() => {
  const project = specEngine.getAllProjects()[0];
  if (!project) return { missing: [], extra: [], violations: [] };
  return specEngine.converge(project.id);
});

function nextPhase() {
  const idx = phaseIndex.value;
  if (idx < phases.length - 1) {
    currentPhase.value = phases[idx + 1].id as SpecPhase;
  }
}

function toggleTask(taskId: string) {
  const project = specEngine.getAllProjects()[0];
  if (project) specEngine.markTaskDone(project.id, taskId);
}
</script>

<style scoped>
.spec-panel { padding: 16px; height: 100%; overflow-y: auto; font-family: var(--font-body); }
.spec-title { font-family: var(--font-serif); font-size: .9rem; color: var(--text-primary); margin-bottom: 12px; }

.spec-phases { display: flex; gap: 4px; margin-bottom: 16px; flex-wrap: wrap; }
.phase-step { display: inline-flex; align-items: center; gap: 4px; padding: 4px 8px; border-radius: 4px; font-size: .62rem; color: var(--silver); border: 1px solid var(--border-light); }
.phase-step.active { color: var(--accent); border-color: var(--accent); }
.phase-step.done { color: var(--jade); border-color: var(--jade); }

.spec-section { margin-bottom: 16px; }
.section-title { font-family: var(--font-serif); font-size: .75rem; color: var(--bone-dim); margin-bottom: 8px; display: flex; align-items: center; gap: 6px; }

.constitution-list { display: flex; flex-direction: column; gap: 4px; margin-bottom: 12px; }
.principle-item { display: flex; align-items: center; gap: 8px; font-size: .62rem; padding: 4px 8px; border-radius: 4px; background: var(--bg-surface); }
.principle-severity { font-family: var(--font-mono); font-size: .55rem; padding: 1px 4px; border-radius: 3px; }
.sev-MUST { background: rgba(239,68,68,.15); color: var(--error); }
.sev-SHOULD { background: rgba(201,168,92,.15); color: var(--gold); }
.sev-MAY { background: var(--bg-active); color: var(--silver); }
.principle-title { color: var(--bone); }

.spec-textarea { width: 100%; min-height: 120px; padding: 10px; border-radius: 8px; border: 1px solid var(--border-light); background: var(--bg-surface); color: var(--text-primary); font-size: .68rem; font-family: var(--font-body); resize: vertical; margin-bottom: 8px; }

.spec-btn { display: inline-flex; align-items: center; gap: 4px; padding: 6px 12px; border-radius: 6px; border: 1px solid var(--border-light); background: transparent; color: var(--accent); cursor: pointer; font-size: .68rem; font-family: var(--font-body); }
.spec-btn:hover { background: var(--bg-active); }

.task-list { display: flex; flex-direction: column; gap: 4px; margin-bottom: 12px; }
.spec-task { display: flex; align-items: center; gap: 6px; font-size: .62rem; color: var(--bone); }
.spec-task input { accent-color: var(--accent); }
.spec-task .done { text-decoration: line-through; opacity: .6; }
.task-parallel { color: var(--gold); font-family: var(--font-mono); font-size: .55rem; }

.converge-result { display: flex; flex-direction: column; gap: 6px; }
.converge-item { display: flex; align-items: center; gap: 6px; font-size: .68rem; color: var(--gold); }
.converge-ok { display: flex; align-items: center; gap: 6px; font-size: .68rem; color: var(--accent); }
</style>
