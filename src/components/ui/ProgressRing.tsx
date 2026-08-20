export default function ProgressRing({ value, max, size = 120, strokeWidth = 8, color = 'stroke-emerald-500' }: {
  value: number; max: number; size?: number; strokeWidth?: number; color?: string;
}) {
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (Math.min(value, max) / max) * circumference;
  return (
    <svg width={size} height={size} className="-rotate-90">
      <circle cx={size/2} cy={size/2} r={radius} fill="none" stroke="currentColor" strokeWidth={strokeWidth} className="text-gray-200 dark:text-gray-700" />
      <circle cx={size/2} cy={size/2} r={radius} fill="none" strokeWidth={strokeWidth} strokeLinecap="round"
        strokeDasharray={circumference} strokeDashoffset={offset}
        className={`${color} transition-all duration-700 ease-out`} />
    </svg>
  );
}
