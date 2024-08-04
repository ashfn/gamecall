export function timeAgo(date) {
    const now = new Date().getTime();
    const epochTimestamp = date.getTime();
    const seconds = Math.floor((now - epochTimestamp) / 1000);
    
    if (seconds < 30) { 
        return `now`
    }

    if (seconds < 60) {
        return `${seconds}s`;
    }
    
    const minutes = Math.floor(seconds / 60);
    if (minutes < 60) {
        return `${minutes}m`;
    }
    
    const hours = Math.floor(minutes / 60);
    if (hours < 24) {
        return `${hours}h`;
    }
    
    const days = Math.floor(hours / 24);
    if (days < 7) {
        return `${days}d`;
    }
    
    const weeks = Math.floor(days / 7);
    return `${weeks}w`;
}