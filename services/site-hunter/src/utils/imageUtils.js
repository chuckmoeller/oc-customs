export const isHeicImage = (base64OrFile) => {
  if (!base64OrFile) return false;
  if (typeof base64OrFile === 'string') {
    const s = base64OrFile.toLowerCase();
    if (s.startsWith('data:image/heic') || s.startsWith('data:image/heif')) return true;
    const prefix = base64OrFile.slice(0, 120);
    if (/ftyp(?:heic|heif|hevc|mif1|msf1)/i.test(prefix)) return true;
    try {
      const comma = base64OrFile.indexOf(',');
      const raw = comma !== -1 ? base64OrFile.slice(comma + 1, comma + 80) : base64OrFile.slice(0, 80);
      const decoded = atob(raw);
      if (decoded.includes('ftyp')) return true;
    } catch {
      // ignore
    }
  } else if (base64OrFile instanceof File || base64OrFile instanceof Blob) {
    const name = base64OrFile.name?.toLowerCase() || '';
    const type = base64OrFile.type?.toLowerCase() || '';
    if (name.endsWith('.heic') || name.endsWith('.heif') || type.includes('heic') || type.includes('heif')) {
      return true;
    }
  }
  return false;
};

export const ensureJpegImage = async (base64) => {
  if (!base64 || typeof base64 !== 'string') return base64;
  if (!isHeicImage(base64)) return base64;

  try {
    const res = await fetch('/api/convert-heic', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ imageBase64: base64 }),
    });
    if (res.ok) {
      const data = await res.json();
      if (data.imageBase64) {
        return data.imageBase64;
      }
    }
  } catch (err) {
    console.warn('[imageUtils] HEIC conversion via backend failed:', err);
  }
  return base64;
};

export const resizeImageForAnalysis = async (base64, maxDim = 1600) => {
  const safeBase64 = await ensureJpegImage(base64);
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      if (img.width <= maxDim && img.height <= maxDim) {
        resolve(safeBase64);
        return;
      }
      const scale = maxDim / Math.max(img.width, img.height);
      const canvas = document.createElement('canvas');
      canvas.width = Math.round(img.width * scale);
      canvas.height = Math.round(img.height * scale);
      canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height);
      resolve(canvas.toDataURL('image/jpeg', 0.80));
    };
    img.onerror = () => {
      console.warn('[imageUtils] Image failed to render into canvas; falling back to original');
      resolve(safeBase64);
    };
    img.src = safeBase64;
  });
};

export const stampLabelOnPhoto = async (base64, label) => {
  const safeBase64 = await ensureJpegImage(base64);
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = img.width;
      canvas.height = img.height;
      const ctx = canvas.getContext('2d');
      ctx.drawImage(img, 0, 0);

      const badgeHeight = Math.max(40, Math.round(img.height * 0.06));
      const fontSize = Math.round(badgeHeight * 0.65);
      ctx.font = `bold ${fontSize}px Arial, sans-serif`;
      const textWidth = ctx.measureText(label).width;
      const badgeWidth = textWidth + badgeHeight * 0.8;
      const padding = badgeHeight * 0.25;
      const x = padding;
      const y = padding;
      const radius = badgeHeight * 0.25;

      ctx.fillStyle = 'rgba(103, 152, 106, 0.9)';
      ctx.beginPath();
      ctx.moveTo(x + radius, y);
      ctx.lineTo(x + badgeWidth - radius, y);
      ctx.quadraticCurveTo(x + badgeWidth, y, x + badgeWidth, y + radius);
      ctx.lineTo(x + badgeWidth, y + badgeHeight - radius);
      ctx.quadraticCurveTo(
        x + badgeWidth,
        y + badgeHeight,
        x + badgeWidth - radius,
        y + badgeHeight
      );
      ctx.lineTo(x + radius, y + badgeHeight);
      ctx.quadraticCurveTo(x, y + badgeHeight, x, y + badgeHeight - radius);
      ctx.lineTo(x, y + radius);
      ctx.quadraticCurveTo(x, y, x + radius, y);
      ctx.closePath();
      ctx.fill();

      ctx.strokeStyle = 'rgba(255, 255, 255, 0.8)';
      ctx.lineWidth = Math.max(2, Math.round(badgeHeight * 0.05));
      ctx.stroke();

      ctx.fillStyle = '#FFFFFF';
      ctx.textBaseline = 'middle';
      ctx.textAlign = 'center';
      ctx.fillText(label, x + badgeWidth / 2, y + badgeHeight / 2);

      resolve(canvas.toDataURL('image/jpeg', 0.85));
    };
    img.onerror = () => {
      console.warn('[imageUtils] Could not stamp label on photo; falling back to original');
      resolve(safeBase64);
    };
    img.src = safeBase64;
  });
};

// Generates photo labels: 1a, 1b...1z, 1aa, 1ab...
export const generatePhotoLabel = (equipmentNumber, index) => {
  const letters = 'abcdefghijklmnopqrstuvwxyz';
  if (index < 26) return `${equipmentNumber}${letters[index]}`;
  const set = Math.floor(index / 26);
  const pos = index % 26;
  return `${equipmentNumber}${letters[set - 1] || ''}${letters[pos]}`;
};
