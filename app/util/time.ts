export function timeAgo(date: Date | string | number, now = Date.now()) {
  const epochTimestamp = date instanceof Date ? date.getTime() : new Date(date).getTime();
  const seconds = Math.max(0, Math.floor((now - epochTimestamp) / 1000));
  if (seconds < 9) return "just now";
  if (seconds < 60) return `${seconds}s`;

  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m`;

  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h`;

  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d`;
  return `${Math.floor(days / 7)}w`;
}
