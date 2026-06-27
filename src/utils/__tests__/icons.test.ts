import { describe, it, expect } from 'vitest';
import { ICONS, getFileIcon, getKanbanIcon, getAgentGlyph } from '../icons';

describe('ICONS', () => {
  it('has action icons defined', () => {
    expect(ICONS.close).toBe('✕');
    expect(ICONS.refresh).toBe('↻');
    expect(ICONS.settings).toBe('⚙');
    expect(ICONS.expand).toBe('▸');
    expect(ICONS.play).toBe('▶');
  });

  it('has navigation icons defined', () => {
    expect(ICONS.arrowUp).toBe('↑');
    expect(ICONS.arrowDown).toBe('↓');
    expect(ICONS.arrowLeft).toBe('←');
    expect(ICONS.arrowRight).toBe('→');
  });

  it('has agent glyphs defined', () => {
    expect(ICONS.mei).toBe('梅');
    expect(ICONS.lan).toBe('兰');
    expect(ICONS.zhu).toBe('竹');
    expect(ICONS.ju).toBe('菊');
  });

  it('has status icons defined', () => {
    expect(ICONS.statusOnline).toBe('●');
    expect(ICONS.statusBusy).toBe('◉');
    expect(ICONS.statusOffline).toBe('○');
    expect(ICONS.statusError).toBe('⊘');
  });

  it('has kanban statuses defined', () => {
    expect(ICONS.kanban.todo).toBe('○');
    expect(ICONS.kanban.done).toBe('✓');
    expect(ICONS.kanban.running).toBe('●');
  });
});

describe('getFileIcon', () => {
  it('returns correct icon for known extensions', () => {
    expect(getFileIcon('app.ts')).toBe('TS');
    expect(getFileIcon('style.css')).toBe('Cs');
    expect(getFileIcon('index.html')).toBe('Ht');
    expect(getFileIcon('data.json')).toBe('{}');
    expect(getFileIcon('image.png')).toBe('图');
    expect(getFileIcon('script.py')).toBe('Py');
  });

  it('returns default file icon for unknown extensions', () => {
    expect(getFileIcon('unknown.xyz')).toBe(ICONS.file);
  });

  it('returns default file icon for files with no extension', () => {
    expect(getFileIcon('Makefile')).toBe(ICONS.file);
  });

  it('handles case-insensitive extensions', () => {
    expect(getFileIcon('app.TS')).toBe('TS');
    expect(getFileIcon('style.CSS')).toBe('Cs');
  });

  it('handles files with multiple dots', () => {
    expect(getFileIcon('app.min.js')).toBe('JS');
  });
});

describe('getKanbanIcon', () => {
  it('returns correct icon for known statuses', () => {
    expect(getKanbanIcon('todo')).toBe('○');
    expect(getKanbanIcon('done')).toBe('✓');
    expect(getKanbanIcon('running')).toBe('●');
    expect(getKanbanIcon('blocked')).toBe('⊘');
  });

  it('returns default todo icon for unknown statuses', () => {
    expect(getKanbanIcon('unknown')).toBe(ICONS.kanban.todo);
  });
});

describe('getAgentGlyph', () => {
  it('returns correct glyph for known agents', () => {
    expect(getAgentGlyph('claude')).toBe('梅');
    expect(getAgentGlyph('codex')).toBe('兰');
    expect(getAgentGlyph('openclaw')).toBe('竹');
    expect(getAgentGlyph('hermes')).toBe('菊');
  });

  it('returns first character for unknown agents', () => {
    expect(getAgentGlyph('unknown')).toBe('u');
  });

  it('handles empty string gracefully', () => {
    expect(getAgentGlyph('')).toBe(undefined);
  });
});
