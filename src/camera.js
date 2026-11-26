/**
 * Mobile-first camera controller + image resizing / cropping utilities.
 */

export class CameraController {
  constructor(videoEl) {
    this.video = videoEl;
    this.stream = null;
    this.facingMode = 'environment';
    this.live = false;
  }

  async start(facing = this.facingMode) {
    this.stop();
    this.facingMode = facing;

    if (!navigator.mediaDevices?.getUserMedia) {
      this.live = false;
      throw new Error('このブラウザはカメラAPIに対応していません（HTTPS環境が必要です）。');
    }

    const constraints = {
      audio: false,
      video: {
        facingMode: { ideal: facing },
        width: { ideal: 1600 },
        height: { ideal: 1200 },
      },
    };

    try {
      this.stream = await navigator.mediaDevices.getUserMedia(constraints);
    } catch {
      // Fallback: try any available video device
      this.stream = await navigator.mediaDevices.getUserMedia({ audio: false, video: true });
    }

    this.video.srcObject = this.stream;
    this.video.classList.toggle('mirrored', this.facingMode === 'user');
    await this.video.play();
    this.live = true;
    return this.stream;
  }

  async flip() {
    const next = this.facingMode === 'environment' ? 'user' : 'environment';
    return this.start(next);
  }

  stop() {
    if (this.stream) {
      for (const track of this.stream.getTracks()) {
        track.stop();
      }
      this.stream = null;
    }
    if (this.video) {
      this.video.srcObject = null;
    }
    this.live = false;
  }

  /**
   * Captures the currently visible area of the video (WYSIWYG for object-fit: cover),
   * resized to maxDim pixels for fast Gemini 4 Hydrogen inference.
   */
  captureFrame(maxDim = 1280, quality = 0.86) {
    const v = this.video;
    if (!v || !v.videoWidth || !v.videoHeight) return null;

    const rect = v.getBoundingClientRect();
    const vw = v.videoWidth;
    const vh = v.videoHeight;
    const targetAspect = rect.width && rect.height ? rect.width / rect.height : vw / vh;
    const videoAspect = vw / vh;

    let sx = 0;
    let sy = 0;
    let sw = vw;
    let sh = vh;

    if (videoAspect > targetAspect) {
      sw = vh * targetAspect;
      sx = (vw - sw) / 2;
    } else {
      sh = vw / targetAspect;
      sy = (vh - sh) / 2;
    }

    const scale = Math.min(1, maxDim / Math.max(sw, sh));
    const cw = Math.max(1, Math.round(sw * scale));
    const ch = Math.max(1, Math.round(sh * scale));

    const canvas = document.createElement('canvas');
    canvas.width = cw;
    canvas.height = ch;
    const ctx = canvas.getContext('2d');

    if (this.facingMode === 'user') {
      ctx.translate(cw, 0);
      ctx.scale(-1, 1);
    }
    ctx.drawImage(v, sx, sy, sw, sh, 0, 0, cw, ch);

    const dataUrl = canvas.toDataURL('image/jpeg', quality);
    return {
      dataUrl,
      base64: dataUrl.split(',')[1],
      width: cw,
      height: ch,
    };
  }
}

/**
 * Resizes an uploaded image File / Blob to maxDim JPEG.
 */
export function resizeImageFile(file, maxDim = 1280, quality = 0.86) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      try {
        const scale = Math.min(1, maxDim / Math.max(img.naturalWidth, img.naturalHeight));
        const cw = Math.max(1, Math.round(img.naturalWidth * scale));
        const ch = Math.max(1, Math.round(img.naturalHeight * scale));
        const canvas = document.createElement('canvas');
        canvas.width = cw;
        canvas.height = ch;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0, cw, ch);
        const dataUrl = canvas.toDataURL('image/jpeg', quality);
        resolve({
          dataUrl,
          base64: dataUrl.split(',')[1],
          width: cw,
          height: ch,
        });
      } catch (err) {
        reject(err);
      } finally {
        URL.revokeObjectURL(url);
      }
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('画像を読み込めませんでした。'));
    };
    img.src = url;
  });
}

/**
 * Crops a small square thumbnail from an <img> element using box_2d [ymin, xmin, ymax, xmax] (0..1000).
 */
export function cropBoxThumbnail(imgEl, box_2d, size = 128) {
  if (!imgEl || !imgEl.naturalWidth || !Array.isArray(box_2d) || box_2d.length !== 4) {
    return '';
  }
  const [ymin, xmin, ymax, xmax] = box_2d;
  const nw = imgEl.naturalWidth;
  const nh = imgEl.naturalHeight;

  const pad = 25;
  const x1 = Math.max(0, ((xmin - pad) / 1000) * nw);
  const y1 = Math.max(0, ((ymin - pad) / 1000) * nh);
  const x2 = Math.min(nw, ((xmax + pad) / 1000) * nw);
  const y2 = Math.min(nh, ((ymax + pad) / 1000) * nh);
  const sw = Math.max(16, x2 - x1);
  const sh = Math.max(16, y2 - y1);

  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');

  // Center-crop square
  const side = Math.max(sw, sh);
  const cx = x1 + sw / 2;
  const cy = y1 + sh / 2;
  const sx = Math.max(0, Math.min(nw - side, cx - side / 2));
  const sy = Math.max(0, Math.min(nh - side, cy - side / 2));

  ctx.fillStyle = '#F2EFEA';
  ctx.fillRect(0, 0, size, size);
  ctx.drawImage(imgEl, sx, sy, Math.min(side, nw), Math.min(side, nh), 0, 0, size, size);
  return canvas.toDataURL('image/jpeg', 0.72);
}

/**
 * Computes the rendered rectangle of an `object-fit: contain` image inside its container.
 */
export function getContainedImageRect(imgEl) {
  const cw = imgEl.clientWidth;
  const ch = imgEl.clientHeight;
  const nw = imgEl.naturalWidth;
  const nh = imgEl.naturalHeight;
  if (!cw || !ch || !nw || !nh) return { x: 0, y: 0, w: cw, h: ch };

  const scale = Math.min(cw / nw, ch / nh);
  const w = nw * scale;
  const h = nh * scale;
  return {
    x: (cw - w) / 2,
    y: (ch - h) / 2,
    w,
    h,
  };
}
