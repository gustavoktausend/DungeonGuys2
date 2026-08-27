import './style.css';

// Placeholder entry point; Task 4 replaces this with the real loop.
const canvas = document.getElementById('game-canvas') as HTMLCanvasElement;
const ctx = canvas.getContext('2d')!;
ctx.fillStyle = '#1a1a2e';
ctx.fillRect(0, 0, canvas.width, canvas.height);
