// Parte 8: lo propio del teléfono cuando Vendiva corre como app (Capacitor).
// En el navegador nada de esto se usa: la app sigue igual que antes.
//
//   - Guardar los videos en la galería (en la app, la descarga del navegador no sirve).
//   - Notificaciones «Te toca publicar» con Firebase Cloud Messaging (Android e iPhone).
// El micrófono usa lo mismo que en el navegador; el permiso y su explicación están en
// ios/App/App/Info.plist y android/app/src/main/AndroidManifest.xml.

import { Capacitor } from '@capacitor/core';

export const esApp = () => Capacitor.isNativePlatform();
export const plataforma = () => Capacitor.getPlatform(); // 'ios' | 'android' | 'web'

const ALBUM = 'Vendiva';

function aBase64(blob) {
  return new Promise((ok, mal) => {
    const lector = new FileReader();
    lector.onload = () => ok(String(lector.result).split(',')[1]);
    lector.onerror = () => mal(lector.error);
    lector.readAsDataURL(blob);
  });
}

/** El álbum «Vendiva» en la galería (Android lo exige; en iPhone es opcional). */
async function albumVendiva(Media) {
  const buscar = async () => (await Media.getAlbums()).albums.find((a) => a.name === ALBUM)?.identifier;
  let id = await buscar();
  if (!id && plataforma() === 'android') {
    await Media.createAlbum({ name: ALBUM });
    id = await buscar();
  }
  return id;
}

/**
 * Guarda un video (ya descargado del servidor) en la galería del teléfono.
 * El archivo pasa por la carpeta temporal de la app y se borra al terminar.
 */
export async function guardarEnGaleria(blob, nombre) {
  const [{ Filesystem, Directory }, { Media }] = await Promise.all([import('@capacitor/filesystem'), import('@capacitor-community/media')]);
  const ruta = `vendiva-${Date.now()}-${nombre.replace(/[^\w.-]/g, '_')}`;
  const escrito = await Filesystem.writeFile({ path: ruta, data: await aBase64(blob), directory: Directory.Cache });
  try {
    const albumIdentifier = await albumVendiva(Media);
    await Media.saveVideo({ path: escrito.uri, ...(albumIdentifier ? { albumIdentifier } : {}), fileName: nombre.replace(/\.mp4$/, '') });
  } finally {
    await Filesystem.deleteFile({ path: ruta, directory: Directory.Cache }).catch(() => {});
  }
}

/**
 * Pide permiso para las notificaciones (solo cuando tiene sentido: al programar algo) y
 * registra el teléfono en el servidor. `enviar(token, plataforma)` lo guarda allá.
 * Devuelve true si quedó registrado.
 */
export async function activarNotificaciones(enviar, { pedirPermiso = true } = {}) {
  if (!esApp()) return false;
  const { FirebaseMessaging } = await import('@capacitor-firebase/messaging');
  let permiso = await FirebaseMessaging.checkPermissions();
  if (permiso.receive !== 'granted' && pedirPermiso) permiso = await FirebaseMessaging.requestPermissions();
  if (permiso.receive !== 'granted') return false;
  const { token } = await FirebaseMessaging.getToken();
  if (!token) return false;
  await enviar(token, plataforma());
  return true;
}

/** El token de este teléfono, sin pedir permiso (para quitarlo al cerrar sesión). */
export async function tokenActual() {
  if (!esApp()) return null;
  const { FirebaseMessaging } = await import('@capacitor-firebase/messaging');
  const permiso = await FirebaseMessaging.checkPermissions();
  if (permiso.receive !== 'granted') return null;
  return (await FirebaseMessaging.getToken()).token ?? null;
}

/** Al abrir la app: si ya dio permiso, pone el token al día; al tocar un aviso, va a Hoy. */
export async function escucharNotificaciones(enviar) {
  if (!esApp()) return;
  const { FirebaseMessaging, Importance } = await import('@capacitor-firebase/messaging');
  if (plataforma() === 'android') {
    // El canal de los avisos (Android 8+): su nombre es lo que ella ve en Ajustes.
    await FirebaseMessaging.createChannel({ id: 'avisos', name: 'Te toca publicar', description: 'Avisos de tu calendario de publicaciones', importance: Importance?.High ?? 4 }).catch(() => {});
  }
  await FirebaseMessaging.addListener('tokenReceived', ({ token }) => token && enviar(token, plataforma()).catch(() => {}));
  await FirebaseMessaging.addListener('notificationActionPerformed', () => {
    window.location.hash = 'hoy';
  });
  await activarNotificaciones(enviar, { pedirPermiso: false }).catch(() => {});
}

// ── Parte 8, pagos opción (b): pagar en la web ─────────────────────────────────

/** Abre una dirección en el navegador del teléfono (Safari o Chrome), fuera de la app. */
export async function abrirEnNavegador(url) {
  if (!esApp()) {
    window.location.assign(url);
    return;
  }
  const { AppLauncher } = await import('@capacitor/app-launcher');
  await AppLauncher.openUrl({ url });
}

/** Cuando la app vuelve al frente (por ejemplo, después de pagar en el navegador). Devuelve cómo dejar de escuchar. */
export function alVolverALaApp(fn) {
  if (!esApp()) return () => {};
  let quitar = null;
  let cancelado = false;
  import('@capacitor/app').then(async ({ App }) => {
    const h = await App.addListener('appStateChange', ({ isActive }) => isActive && fn());
    if (cancelado) h.remove();
    else quitar = () => h.remove();
  });
  return () => {
    cancelado = true;
    quitar?.();
  };
}
