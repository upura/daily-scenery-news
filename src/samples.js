/**
 * Generates crisp built-in sample daily-scenery JPEG images on Canvas
 * (inspired by Fig. 1 & Fig. 3 of the KES 2025 paper: Desk, Kitchen Hotpot, Bedroom)
 * so anyone can test immediately on GitHub Pages even without a camera.
 */

function renderScene(drawFn) {
  const canvas = document.createElement('canvas');
  canvas.width = 960;
  canvas.height = 720;
  const ctx = canvas.getContext('2d');
  drawFn(ctx, 960, 720);
  const dataUrl = canvas.toDataURL('image/jpeg', 0.9);
  return {
    dataUrl,
    base64: dataUrl.split(',')[1],
    width: 960,
    height: 720,
  };
}

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, r);
  ctx.fill();
}

export function getSampleScene(name) {
  if (name === 'kitchen') {
    // Homage to Paper Fig. 1: Japanese nabe hotpot (Chinese cabbage, tofu, mushrooms, green onion, kettle)
    return renderScene((ctx, w, h) => {
      // Warm wooden table
      ctx.fillStyle = '#C89F72';
      ctx.fillRect(0, 0, w, h);
      ctx.fillStyle = '#B98E60';
      for (let y = 0; y < h; y += 72) {
        ctx.fillRect(0, y, w, 3);
      }

      // Clay Nabe Pot (center)
      ctx.fillStyle = '#3B2F2F';
      ctx.beginPath();
      ctx.ellipse(470, 390, 225, 195, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#D9B88C';
      ctx.beginPath();
      ctx.ellipse(470, 390, 195, 165, 0, 0, Math.PI * 2);
      ctx.fill();

      // Chinese cabbage (白菜)
      ctx.fillStyle = '#8BC34A';
      roundRect(ctx, 310, 270, 110, 80, 26);
      ctx.fillStyle = '#F1F8E9';
      roundRect(ctx, 330, 290, 70, 42, 14);

      // Tofu blocks (豆腐)
      ctx.fillStyle = '#FFFDF7';
      roundRect(ctx, 480, 275, 92, 66, 8);
      ctx.strokeStyle = '#E5DEC9';
      ctx.lineWidth = 3;
      ctx.strokeRect(480, 275, 92, 66);

      // Shiitake mushrooms (しいたけ)
      ctx.fillStyle = '#6D4C41';
      ctx.beginPath();
      ctx.ellipse(380, 430, 48, 36, -0.2, 0, Math.PI * 2);
      ctx.fill();
      ctx.beginPath();
      ctx.ellipse(445, 470, 42, 32, 0.2, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = '#EFEBE9';
      ctx.lineWidth = 5;
      ctx.beginPath();
      ctx.moveTo(366, 425);
      ctx.lineTo(394, 435);
      ctx.moveTo(380, 415);
      ctx.lineTo(380, 445);
      ctx.stroke();

      // Green onions (長ねぎ)
      ctx.fillStyle = '#4CAF50';
      ctx.save();
      ctx.translate(540, 420);
      ctx.rotate(-0.45);
      roundRect(ctx, -45, -18, 95, 24, 10);
      ctx.fillStyle = '#F5F5DC';
      roundRect(ctx, -45, 12, 95, 24, 10);
      ctx.restore();

      // Electric kettle on top-right
      ctx.fillStyle = '#263238';
      roundRect(ctx, 730, 90, 140, 195, 22);
      ctx.fillStyle = '#455A64';
      roundRect(ctx, 745, 110, 110, 155, 14);
      ctx.strokeStyle = '#263238';
      ctx.lineWidth = 18;
      ctx.beginPath();
      ctx.arc(870, 185, 42, -Math.PI / 2, Math.PI / 2);
      ctx.stroke();

      // Soy sauce bottle on left
      ctx.fillStyle = '#4E1A1A';
      roundRect(ctx, 85, 120, 88, 220, 18);
      ctx.fillStyle = '#D32F2F';
      roundRect(ctx, 104, 78, 50, 46, 8);
      ctx.fillStyle = '#FFF8E1';
      roundRect(ctx, 98, 175, 62, 90, 6);
    });
  }

  if (name === 'bedroom') {
    // Homage to Paper §5.4: Bedroom (bed, lamp, desk, chair, window)
    return renderScene((ctx, w, h) => {
      // Wall & Floor
      ctx.fillStyle = '#EFEBE4';
      ctx.fillRect(0, 0, w, 460);
      ctx.fillStyle = '#C9A882';
      ctx.fillRect(0, 460, w, 260);

      // Window (top-left)
      ctx.fillStyle = '#B3E5FC';
      roundRect(ctx, 75, 65, 230, 220, 8);
      ctx.strokeStyle = '#FFFFFF';
      ctx.lineWidth = 12;
      ctx.strokeRect(75, 65, 230, 220);
      ctx.beginPath();
      ctx.moveTo(190, 65);
      ctx.lineTo(190, 285);
      ctx.moveTo(75, 175);
      ctx.lineTo(305, 175);
      ctx.stroke();

      // Bed (center-right)
      ctx.fillStyle = '#6D4C41';
      roundRect(ctx, 410, 270, 470, 190, 12);
      ctx.fillStyle = '#FFFFFF';
      roundRect(ctx, 430, 320, 430, 180, 16);
      ctx.fillStyle = '#5C6BC0';
      roundRect(ctx, 430, 400, 430, 150, 14);
      // Pillows
      ctx.fillStyle = '#F5F5F5';
      roundRect(ctx, 460, 325, 140, 65, 18);
      roundRect(ctx, 630, 325, 140, 65, 18);

      // Nightstand & Desk Lamp
      ctx.fillStyle = '#8D6E63';
      roundRect(ctx, 275, 420, 115, 130, 10);
      // Lamp stem & shade
      ctx.fillStyle = '#424242';
      ctx.fillRect(325, 345, 14, 78);
      ctx.fillStyle = '#FFD54F';
      ctx.beginPath();
      ctx.moveTo(295, 350);
      ctx.lineTo(370, 350);
      ctx.lineTo(352, 285);
      ctx.lineTo(313, 285);
      ctx.closePath();
      ctx.fill();

      // Wooden Chair (bottom-left)
      ctx.fillStyle = '#795548';
      roundRect(ctx, 90, 430, 115, 24, 6);
      roundRect(ctx, 96, 330, 104, 105, 8);
      ctx.fillRect(102, 454, 14, 120);
      ctx.fillRect(182, 454, 14, 120);
    });
  }

  // Default: Desk scene (laptop, coffee mug, smartphone, houseplant, headphones)
  return renderScene((ctx, w, h) => {
    // Desk surface
    ctx.fillStyle = '#E6D5C1';
    ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = '#F4EFE8';
    ctx.fillRect(0, 0, w, 145);

    // Laptop (center-left)
    ctx.fillStyle = '#27272A';
    roundRect(ctx, 130, 110, 410, 260, 18);
    ctx.fillStyle = '#38BDF8';
    roundRect(ctx, 148, 128, 374, 224, 8);
    ctx.fillStyle = '#A1A1AA';
    roundRect(ctx, 95, 372, 480, 40, 10);

    // Coffee Mug (right)
    ctx.fillStyle = '#FFFFFF';
    roundRect(ctx, 640, 275, 118, 130, 18);
    ctx.strokeStyle = '#FFFFFF';
    ctx.lineWidth = 18;
    ctx.beginPath();
    ctx.arc(760, 340, 32, -Math.PI / 2, Math.PI / 2);
    ctx.stroke();
    ctx.fillStyle = '#4E342E';
    ctx.beginPath();
    ctx.ellipse(699, 285, 48, 16, 0, 0, Math.PI * 2);
    ctx.fill();

    // Potted Houseplant (top-right)
    ctx.fillStyle = '#C65D3B';
    roundRect(ctx, 765, 140, 105, 95, 14);
    ctx.fillStyle = '#2E7D32';
    ctx.beginPath();
    ctx.ellipse(818, 110, 58, 38, -0.3, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#43A047';
    ctx.beginPath();
    ctx.ellipse(845, 95, 42, 30, 0.4, 0, Math.PI * 2);
    ctx.fill();

    // Smartphone (bottom-left)
    ctx.fillStyle = '#18181B';
    roundRect(ctx, 145, 470, 115, 195, 20);
    ctx.fillStyle = '#3F3F46';
    roundRect(ctx, 155, 484, 95, 167, 12);

    // Over-ear Headphones (bottom-center-right)
    ctx.strokeStyle = '#1E293B';
    ctx.lineWidth = 22;
    ctx.beginPath();
    ctx.arc(545, 550, 88, Math.PI, 0);
    ctx.stroke();
    ctx.fillStyle = '#D95D39';
    roundRect(ctx, 435, 535, 44, 88, 18);
    roundRect(ctx, 610, 535, 44, 88, 18);
  });
}
