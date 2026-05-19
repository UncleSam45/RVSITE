// Starter frontend script for the webframe
window.webframe = {
  version: '0.1.0',
  init() {
    const root = document.getElementById('webframe-root');
    if (!root) return;

    const message = document.createElement('p');
    message.textContent = 'HELLO WORLD';
    message.style.fontFamily = 'system-ui, sans-serif';
    root.appendChild(message);
  },
};

window.addEventListener('DOMContentLoaded', () => {
  window.webframe?.init();
});
