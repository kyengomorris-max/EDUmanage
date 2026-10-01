export type GradeBandInput = {
  minScore: number;
  maxScore: number;
  letter: string;
  remark?: string | null;
  points?: number | null;
};

export function percentage(score: number, maxScore: number) {
  if (!Number.isFinite(score) || !Number.isFinite(maxScore) || maxScore <= 0) return 0;
  return Math.round((score / maxScore) * 1000) / 10;
}

export function bandFor(percent: number, bands: GradeBandInput[]) {
  const sorted = [...bands].sort((a, b) => b.minScore - a.minScore);
  return sorted.find((band) => percent >= band.minScore && percent <= band.maxScore) ?? null;
}

export function average(values: number[]) {
  if (values.length === 0) return 0;
  const total = values.reduce((sum, value) => sum + value, 0);
  return Math.round((total / values.length) * 10) / 10;
}

export function rankByAverage<T extends { average: number }>(rows: T[]) {
  const sorted = [...rows].sort((a, b) => b.average - a.average || 0);
  let rank = 0;
  let previous: number | null = null;
  return sorted.map((row, index) => {
    if (previous === null || row.average !== previous) rank = index + 1;
    previous = row.average;
    return { ...row, position: rank };
  });
}
