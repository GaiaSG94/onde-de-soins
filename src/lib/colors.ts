import { CLASSES, type ClassId } from '../config.ts';

const byId = new Map(CLASSES.map((c) => [c.id, c]));

export function classColor(id: ClassId): string {
  return byId.get(id)?.color ?? '#5B3A8C';
}

export function classLabel(id: ClassId): string {
  return byId.get(id)?.label ?? id;
}

export function classForMinutes(minutes: number): ClassId {
  const found = CLASSES.find((c) => minutes < c.max);
  return found?.id ?? '60+';
}

function luminance(hex: string): number {
  const channels = [1, 3, 5].map((i) => {
    const value = parseInt(hex.slice(i, i + 2), 16) / 255;
    return value <= 0.03928 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * channels[0] + 0.7152 * channels[1] + 0.0722 * channels[2];
}

function contrast(a: string, b: string): number {
  const la = luminance(a);
  const lb = luminance(b);
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}

export function readableText(background: string): string {
  return contrast(background, '#0F172A') >= contrast(background, '#FFFFFF')
    ? '#0F172A'
    : '#FFFFFF';
}
