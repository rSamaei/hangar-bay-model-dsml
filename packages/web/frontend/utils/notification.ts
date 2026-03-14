export function showNotification(message: string, type: 'success' | 'error' | 'warning' = 'error') {
  const colors = {
    success: 'bg-emerald-500/90 text-white',
    error: 'bg-red-500/90 text-white',
    warning: 'bg-amber-500/90 text-white'
  };

  const notification = document.createElement('div');
  notification.className = `fixed bottom-4 right-4 px-4 py-3 rounded-lg ${colors[type]} shadow-lg z-50 animate-fade-in`;
  notification.textContent = message;

  document.body.appendChild(notification);

  setTimeout(() => {
    notification.classList.add('opacity-0', 'transition-opacity');
    setTimeout(() => notification.remove(), 300);
  }, 3000);
}
