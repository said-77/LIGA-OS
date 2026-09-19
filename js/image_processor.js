/* ==========================================================================
   LIGA OS — Модуль обработки и сжатия фотографий (Image Processor)
   Сжатие на клиенте через Canvas • Защита памяти IndexedDB • Без серверов
   ========================================================================== */

class LigaImageProcessor {
  /**
   * Сжимает изображение из File / Blob до заданного максимального размера
   * @param {File|Blob} file Исходный файл с камеры смартфона
   * @param {number} maxWidth Максимальная ширина/высота (по умолчанию 1600px)
   * @param {number} quality Качество JPEG (0.82 оптимально для технической четкости рулетки)
   * @returns {Promise<string>} Base64 Data URL сжатого изображения
   */
  static async compressImage(file, maxWidth = 1600, quality = 0.82) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onerror = () => reject(new Error('Ошибка чтения файла изображения'));
      reader.onload = (e) => {
        const img = new Image();
        img.onerror = () => reject(new Error('Не удалось декодировать изображение'));
        img.onload = () => {
          let width = img.width;
          let height = img.height;

          // Масштабируем с сохранением пропорций
          if (width > height) {
            if (width > maxWidth) {
              height = Math.round((height * maxWidth) / width);
              width = maxWidth;
            }
          } else {
            if (height > maxWidth) {
              width = Math.round((width * maxWidth) / height);
              height = maxWidth;
            }
          }

          const canvas = document.createElement('canvas');
          canvas.width = width;
          canvas.height = height;
          const ctx = canvas.getContext('2d');
          
          // Высококачественное сглаживание
          ctx.imageSmoothingEnabled = true;
          ctx.imageSmoothingQuality = 'high';
          ctx.drawImage(img, 0, 0, width, height);

          // Экспортируем в компактный JPEG
          const dataUrl = canvas.toDataURL('image/jpeg', quality);
          resolve(dataUrl);
        };
        img.src = e.target.result;
      };
      reader.readAsDataURL(file);
    });
  }
}

window.ligaImageProcessor = LigaImageProcessor;
