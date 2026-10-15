const COMPRESSIBLE = ['image/jpeg', 'image/png', 'image/webp'];
const MAX_SIDE = 1600;

/**
 * Las fotos de celular pesan 3-8 MB. Reducirlas a ~1600 px antes de subir hace que el
 * comprobante llegue rápido incluso con datos móviles, y sigue siendo legible.
 * HEIC y PDF se suben tal cual (el navegador no siempre puede decodificar HEIC).
 */
export async function compressReceipt(file: File): Promise<File> {
  if (!COMPRESSIBLE.includes(file.type) || file.size < 700 * 1024) return file;
  try {
    const bitmap = await createImageBitmap(file);
    const scale = Math.min(1, MAX_SIDE / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(bitmap.width * scale);
    canvas.height = Math.round(bitmap.height * scale);
    canvas.getContext('2d')!.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    bitmap.close();

    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.82));
    if (!blob || blob.size >= file.size) return file;
    return new File([blob], file.name.replace(/\.\w+$/, '') + '.jpg', { type: 'image/jpeg' });
  } catch {
    return file;
  }
}
