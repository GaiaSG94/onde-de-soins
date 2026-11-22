export function coverageColor(hex: string, opacity: number): [number, number, number, number] {
  const channels = [1, 3, 5].map((index) => parseInt(hex.slice(index, index + 2), 16));
  return [channels[0], channels[1], channels[2], Math.round(opacity * 255)];
}

export function crossIcon(color: string): string {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="48" height="48" viewBox="0 0 48 48"><circle cx="24" cy="24" r="20" fill="${color}" stroke="#ffffff" stroke-width="3"/><rect x="21" y="12" width="6" height="24" rx="2" fill="#ffffff"/><rect x="12" y="21" width="24" height="6" rx="2" fill="#ffffff"/></svg>`;
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}
