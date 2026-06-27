/**
 * Annotation Pipeline — inspired by Codex Tracker
 * Pipeline pattern: data → annotate1 → annotate2 → result
 * Provides efficiency, cost, and project annotations.
 */

import { estimateCost } from './pricing';

// ══════════════════════════════════════════════
// Types
// ══════════════════════════════════════════════

export interface AnnotatedData {
  raw: Record<string, unknown>;
  annotations: Record<string, unknown>;
}

export interface EfficiencyAnnotation {
  tokensPerSecond: number;
  totalTokens: number;
  durationMs: number;
  label: 'fast' | 'normal' | 'slow';
}

export interface CostAnnotation {
  estimatedCost: number;
  formattedCost: string;
  model: string;
  confidence: 'exact' | 'estimated' | 'unknown';
}

export interface ProjectAnnotation {
  detectedProject: string | null;
  projectType: string | null;
  confidence: 'high' | 'medium' | 'low';
}

// ══════════════════════════════════════════════
// Pipeline Combinator
// ══════════════════════════════════════════════

export type AnnotationFn = (data: AnnotatedData) => AnnotatedData;

/**
 * Compose multiple annotation functions into a pipeline.
 * Usage: const pipeline = pipe(annotate1, annotate2, annotate3);
 *        const result = pipeline(initialData);
 */
export function pipe(...fns: AnnotationFn[]): AnnotationFn {
  return (data: AnnotatedData): AnnotatedData => {
    return fns.reduce((acc, fn) => fn(acc), data);
  };
}

/**
 * Create an initial annotated data object from raw data.
 */
export function createAnnotatedData(raw: Record<string, unknown>): AnnotatedData {
  return { raw, annotations: {} };
}

// ══════════════════════════════════════════════
// Efficiency Annotation
// ══════════════════════════════════════════════

/**
 * Annotate data with efficiency metrics (tokens/second).
 */
export function annotateWithEfficiency(tokens: number, durationMs: number): AnnotationFn {
  return (data: AnnotatedData): AnnotatedData => {
    const durationSec = durationMs / 1000;
    const tokensPerSecond = durationSec > 0 ? tokens / durationSec : 0;

    let label: 'fast' | 'normal' | 'slow';
    if (tokensPerSecond > 100) label = 'fast';
    else if (tokensPerSecond > 20) label = 'normal';
    else label = 'slow';

    const annotation: EfficiencyAnnotation = {
      tokensPerSecond: Math.round(tokensPerSecond * 100) / 100,
      totalTokens: tokens,
      durationMs,
      label,
    };

    return {
      ...data,
      annotations: { ...data.annotations, efficiency: annotation },
    };
  };
}

// ══════════════════════════════════════════════
// Cost Annotation
// ══════════════════════════════════════════════

/**
 * Annotate data with estimated cost.
 */
export function annotateWithCost(tokens: number, model: string, provider?: string): AnnotationFn {
  return (data: AnnotatedData): AnnotatedData => {
    // Assume 70% input, 30% output split when not specified
    const inputTokens = Math.round(tokens * 0.7);
    const outputTokens = Math.round(tokens * 0.3);
    const estimate = estimateCost(inputTokens, outputTokens, model, provider);

    const annotation: CostAnnotation = {
      estimatedCost: estimate.totalCost,
      formattedCost: estimate.totalCost === 0
        ? '$0.00'
        : estimate.totalCost < 0.01
          ? `$${estimate.totalCost.toFixed(6)}`
          : estimate.totalCost < 1
            ? `$${estimate.totalCost.toFixed(4)}`
            : `$${estimate.totalCost.toFixed(2)}`,
      model: estimate.model,
      confidence: estimate.confidence,
    };

    return {
      ...data,
      annotations: { ...data.annotations, cost: annotation },
    };
  };
}

// ══════════════════════════════════════════════
// Project Detection Annotation
// ══════════════════════════════════════════════

const PROJECT_PATTERNS: Array<{ pattern: RegExp; project: string; type: string }> = [
  { pattern: /package\.json/i, project: 'Node.js', type: 'javascript' },
  { pattern: /Cargo\.toml/i, project: 'Rust', type: 'rust' },
  { pattern: /pyproject\.toml|setup\.py|requirements\.txt/i, project: 'Python', type: 'python' },
  { pattern: /go\.mod/i, project: 'Go', type: 'go' },
  { pattern: /pom\.xml|build\.gradle/i, project: 'Java', type: 'java' },
  { pattern: /Cargo\.toml|\.rs$/i, project: 'Rust', type: 'rust' },
  { pattern: /tauri\.conf\.json/i, project: 'Tauri', type: 'tauri' },
  { pattern: /vite\.config\./i, project: 'Vite', type: 'frontend' },
  { pattern: /vue|\.vue$/i, project: 'Vue', type: 'frontend' },
  { pattern: /react|\.jsx$|\.tsx$/i, project: 'React', type: 'frontend' },
];

/**
 * Detect project type from message content or file references.
 */
export function annotateWithProject(messages: Array<{ content: string }>): AnnotationFn {
  return (data: AnnotatedData): AnnotatedData => {
    const combined = messages.map(m => m.content).join(' ');
    let detectedProject: string | null = null;
    let projectType: string | null = null;
    let confidence: 'high' | 'medium' | 'low' = 'low';

    for (const { pattern, project, type } of PROJECT_PATTERNS) {
      if (pattern.test(combined)) {
        detectedProject = project;
        projectType = type;
        // File path references are higher confidence than keyword mentions
        if (pattern.source.includes('\\\\') || pattern.source.includes('\\.')) {
          confidence = 'medium';
        } else {
          confidence = 'medium';
        }
        break;
      }
    }

    // Check if multiple patterns match (higher confidence)
    const matchCount = PROJECT_PATTERNS.filter(p => p.pattern.test(combined)).length;
    if (matchCount >= 3) confidence = 'high';

    const annotation: ProjectAnnotation = {
      detectedProject,
      projectType,
      confidence,
    };

    return {
      ...data,
      annotations: { ...data.annotations, project: annotation },
    };
  };
}
