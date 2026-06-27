import { describe, it, expect } from 'vitest';
import { getRichFileIcon, getFileIconColor, isImageFile, PALETTE } from '../richIcons';

describe('getRichFileIcon', () => {
  it('returns SVG string for known code files', () => {
    const svg = getRichFileIcon('app.ts');
    expect(svg).toContain('<svg');
    expect(svg).toContain('</svg>');
    expect(svg).toContain('TS');
  });

  it('returns SVG for JavaScript files', () => {
    const svg = getRichFileIcon('index.js');
    expect(svg).toContain('JS');
    expect(svg).toContain('#f7df1e'); // JS yellow
  });

  it('returns SVG for Vue files', () => {
    const svg = getRichFileIcon('App.vue');
    expect(svg).toContain('Vue');
    expect(svg).toContain('#42b883'); // Vue green
  });

  it('returns document SVG for PDF files', () => {
    const svg = getRichFileIcon('report.pdf');
    expect(svg).toContain('<svg');
    expect(svg).toContain('PDF');
    expect(svg).toContain('#b30b00'); // PDF red
  });

  it('returns image SVG for PNG files', () => {
    const svg = getRichFileIcon('photo.png');
    expect(svg).toContain('<svg');
    // Image icons use landscape shapes, not text labels
    expect(svg).toContain('<circle');
  });

  it('returns archive SVG for ZIP files', () => {
    const svg = getRichFileIcon('archive.zip');
    expect(svg).toContain('ZIP');
  });

  it('returns default SVG for unknown extensions', () => {
    const svg = getRichFileIcon('unknown.xyz');
    expect(svg).toContain('<svg');
    expect(svg).toContain('</svg>');
    // Default icon doesn't have text label
    expect(svg).not.toContain('XYZ');
  });

  it('returns default SVG for files with no extension', () => {
    const svg = getRichFileIcon('Makefile');
    expect(svg).toContain('<svg');
  });

  it('handles case-insensitive extensions', () => {
    const svg = getRichFileIcon('APP.TS');
    expect(svg).toContain('TS');
  });

  it('handles files with multiple dots', () => {
    const svg = getRichFileIcon('app.min.js');
    expect(svg).toContain('JS');
  });

  it('returns media SVG for video files', () => {
    const svg = getRichFileIcon('video.mp4');
    expect(svg).toContain('MP4');
  });

  it('returns media SVG for audio files', () => {
    const svg = getRichFileIcon('audio.mp3');
    expect(svg).toContain('MP3');
  });
});

describe('getFileIconColor', () => {
  it('returns correct color for TypeScript files', () => {
    expect(getFileIconColor('app.ts')).toBe(PALETTE.typescript);
  });

  it('returns correct color for Python files', () => {
    expect(getFileIconColor('script.py')).toBe(PALETTE.python);
  });

  it('returns default color for unknown extensions', () => {
    expect(getFileIconColor('unknown.xyz')).toBe(PALETTE.default);
  });

  it('returns correct color for Vue files', () => {
    expect(getFileIconColor('App.vue')).toBe(PALETTE.vue);
  });
});

describe('isImageFile', () => {
  it('returns true for image extensions', () => {
    expect(isImageFile('photo.png')).toBe(true);
    expect(isImageFile('pic.jpg')).toBe(true);
    expect(isImageFile('anim.gif')).toBe(true);
    expect(isImageFile('vector.svg')).toBe(true);
  });

  it('returns false for non-image extensions', () => {
    expect(isImageFile('code.ts')).toBe(false);
    expect(isImageFile('doc.pdf')).toBe(false);
    expect(isImageFile('archive.zip')).toBe(false);
  });

  it('returns false for unknown extensions', () => {
    expect(isImageFile('file.xyz')).toBe(false);
  });
});

describe('PALETTE', () => {
  it('has expected color values', () => {
    expect(PALETTE.typescript).toBe('#3178c6');
    expect(PALETTE.vue).toBe('#42b883');
    expect(PALETTE.rust).toBe('#dea584');
    expect(PALETTE.python).toBe('#3572a5');
  });

  it('has default color', () => {
    expect(PALETTE.default).toBe('#565f89');
  });
});
