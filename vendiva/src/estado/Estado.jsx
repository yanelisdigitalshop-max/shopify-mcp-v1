// Un solo estado central: perfil + productos + créditos + historial.
// El servidor es la fuente de verdad: cada acción guarda allá y trae de vuelta
// el estado completo. Aquí no hay localStorage ni sessionStorage.

import { createContext, useCallback, useContext, useEffect, useMemo, useReducer, useRef, useState } from 'react';
import { api, ESPERA_IA_MS } from '../api.js';

const Contexto = createContext(null);

const INICIAL = {
  fase: 'cargando', // 'cargando' | 'listo' | 'error'
  errorArranque: null,
  datos: null, // null = sin sesión. Con sesión: { usuaria, perfil, nivel, plan, creditos, productos, creaciones, limites, historial }
  sesionVencida: false,
};

function reductor(estado, accion) {
  switch (accion.tipo) {
    case 'cargando':
      return { ...estado, fase: 'cargando', errorArranque: null };
    case 'listo':
      return { ...estado, fase: 'listo', datos: accion.estado, errorArranque: null };
    case 'falloArranque':
      return { ...estado, fase: 'error', errorArranque: accion.error };
    case 'estado':
      return { ...estado, datos: accion.estado, sesionVencida: false };
    case 'salio':
      return { ...estado, datos: null, sesionVencida: false };
    case 'sesionVencida':
      return { ...estado, datos: null, sesionVencida: true };
    default:
      return estado;
  }
}

export function ProveedorEstado({ children }) {
  const [estado, despachar] = useReducer(reductor, INICIAL);

  const acciones = useMemo(() => {
    const guardar = async (promesa) => {
      try {
        const r = await promesa;
        despachar({ tipo: 'estado', estado: r.estado });
        return r;
      } catch (error) {
        if (error.codigo === 'SIN_SESION') despachar({ tipo: 'sesionVencida' });
        throw error;
      }
    };

    return {
      async cargar() {
        despachar({ tipo: 'cargando' });
        try {
          const r = await api.get('/estado');
          despachar({ tipo: 'listo', estado: r.estado });
        } catch (error) {
          if (error.estado === 401) despachar({ tipo: 'listo', estado: null });
          else despachar({ tipo: 'falloArranque', error });
        }
      },
      registrar: (datos) => guardar(api.post('/cuenta/registro', datos)),
      entrar: (datos) => guardar(api.post('/cuenta/entrar', datos)),
      async salir() {
        await api.post('/cuenta/salir');
        despachar({ tipo: 'salio' });
      },
      guardarPerfil: (cambios) => guardar(api.patch('/perfil', cambios)),
      agregarProducto: (producto) => guardar(api.post('/productos', producto)),
      editarProducto: (id, cambios) => guardar(api.patch(`/productos/${id}`, cambios)),
      borrarProducto: (id) => guardar(api.del(`/productos/${id}`)),

      // Parte 3: buscador y tendencias.
      buscar: (consulta) => guardar(api.post('/buscador', { consulta }, { esperaMs: ESPERA_IA_MS })),
      guardarProducto: (busquedaId, indice) => guardar(api.post(`/buscador/${busquedaId}/guardar`, { indice })),
      crearTendencias: () => guardar(api.post('/tendencias', {}, { esperaMs: ESPERA_IA_MS })),

      // Lo que escribe la IA. Los guiones son gratis; lo demás lleva el costo que ella aceptó en el aviso.
      // costoAceptado solo hace falta para los guiones extra del plan Gratis (después del tope del mes).
      crearGuiones: (productoId, costoAceptado) =>
        guardar(api.post(`/productos/${productoId}/guiones`, costoAceptado == null ? {} : { costoAceptado }, { esperaMs: ESPERA_IA_MS })),
      crearEnVivo: (productoId, costoAceptado) =>
        guardar(api.post(`/productos/${productoId}/guion-en-vivo`, { costoAceptado }, { esperaMs: ESPERA_IA_MS })),
      crearRespuestas: (productoId, costoAceptado) =>
        guardar(api.post(`/productos/${productoId}/respuestas-comentarios`, { costoAceptado }, { esperaMs: ESPERA_IA_MS })),
      crearGifs: (productoId, costoAceptado) => guardar(api.post(`/productos/${productoId}/gifs`, { costoAceptado }, { esperaMs: ESPERA_IA_MS })),

      // Parte 4: videos con IA (Runway). Se piden aquí; Runway los termina en 1 a 5 minutos.
      crearVideo: (productoId, tipo, indice, costoAceptado) =>
        guardar(api.post(`/productos/${productoId}/videos`, { tipo, indice, costoAceptado }, { esperaMs: ESPERA_IA_MS })),

      // Voz de los videos: la de ella (grabada, gratis) o la de IA (ElevenLabs, con el costo aceptado).
      guardarVozReal: (videoId, grabacion) => guardar(api.subir(`/videos/${videoId}/voz-real`, grabacion)),
      crearVozIA: (videoId, costoAceptado) => guardar(api.post(`/videos/${videoId}/voz-ia`, { costoAceptado }, { esperaMs: ESPERA_IA_MS })),
      quitarVoz: (videoId) => guardar(api.del(`/videos/${videoId}/voz`)),

      // Parte 5: Programar. Su calendario (gratis; Vendiva no publica en TikTok, ella publica a mano).
      // que: { tipo: 'guion', creacionId, numero } o { tipo: 'video', videoId }. programadaPara: ISO con zona.
      programar: (que, programadaPara) => guardar(api.post('/publicaciones', { ...que, programadaPara })),
      cambiarPublicacion: (id, cambios) => guardar(api.patch(`/publicaciones/${id}`, cambios)),
      quitarPublicacion: (id) => guardar(api.del(`/publicaciones/${id}`)),

      // Parte 6: textos de un guion para sus otras redes (1 crédito de texto por red) y Vitrina (solo Pro).
      crearTextosRedes: (creacionId, numero, costoAceptado) =>
        guardar(api.post(`/creaciones/${creacionId}/guiones/${numero}/textos-redes`, { costoAceptado }, { esperaMs: ESPERA_IA_MS })),
      guardarVitrina: (datos) => guardar(api.post('/vitrina', datos, { esperaMs: ESPERA_IA_MS })),
      reintentarPlanVitrina: (id) => guardar(api.post(`/vitrina/${id}/plan`, {}, { esperaMs: ESPERA_IA_MS })),

      // Baja el archivo al teléfono; el servidor lo marca como descargado y se trae el estado nuevo.
      async descargarVideo(videoId) {
        const r = await api.descargar(`/videos/${videoId}/descargar`);
        try {
          const e = await api.get('/estado');
          despachar({ tipo: 'estado', estado: e.estado });
        } catch {
          // ya se descargó; el estado se pondrá al día en la próxima vuelta
        }
        return r;
      },

      // Trae el estado otra vez sin mostrar "cargando" (para ver si un video ya quedó listo).
      async refrescar() {
        try {
          const r = await api.get('/estado');
          despachar({ tipo: 'estado', estado: r.estado });
        } catch (error) {
          if (error.estado === 401) despachar({ tipo: 'sesionVencida' });
          // Sin internet un momento: se vuelve a intentar en la próxima vuelta.
        }
      },
    };
  }, []);

  useEffect(() => {
    acciones.cargar();
  }, [acciones]);

  // Mientras haya un video creándose, se revisa cada 10 segundos (aunque ella esté en otra pestaña de la app).
  const hayVideoEnCurso = useMemo(() => {
    const videos = estado.datos?.videos;
    if (!videos) return false;
    return Object.values(videos).some((porTipo) =>
      Object.values(porTipo).some((lista) => lista.some((v) => v && (v.estado === 'preparando' || v.estado === 'procesando'))),
    );
  }, [estado.datos]);
  useEffect(() => {
    if (!hayVideoEnCurso) return undefined;
    const t = setInterval(() => {
      if (document.visibilityState === 'visible') acciones.refrescar();
    }, 10000);
    return () => clearInterval(t);
  }, [hayVideoEnCurso, acciones]);

  const valor = useMemo(() => ({ ...estado, acciones }), [estado, acciones]);
  return <Contexto.Provider value={valor}>{children}</Contexto.Provider>;
}

export function useEstado() {
  const valor = useContext(Contexto);
  if (!valor) throw new Error('useEstado se usa dentro de <ProveedorEstado>');
  return valor;
}

/**
 * Envuelve una acción que habla con el servidor: lleva el "cargando", guarda el
 * error para mostrarlo con un mensaje amable y recuerda los datos para "Reintentar".
 *
 * `alExito(valor, ...datos)` corre cuando la acción sale bien, tanto en el primer
 * intento como al reintentar: así "Reintentar" termina exactamente igual que si
 * hubiera funcionado a la primera (cierra la hoja, avanza de paso, etc.).
 */
export function useAccion(fn, { alExito } = {}) {
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState(null);
  const ultimos = useRef(null);
  const fnActual = useRef(fn);
  fnActual.current = fn;
  const exitoActual = useRef(alExito);
  exitoActual.current = alExito;

  const ejecutar = useCallback(async (...args) => {
    ultimos.current = args;
    setCargando(true);
    setError(null);
    try {
      const valor = await fnActual.current(...args);
      exitoActual.current?.(valor, ...args);
      return { ok: true, valor };
    } catch (e) {
      setError(e);
      return { ok: false, error: e };
    } finally {
      setCargando(false);
    }
  }, []);

  const reintentar = useCallback(() => ejecutar(...(ultimos.current ?? [])), [ejecutar]);
  const limpiar = useCallback(() => setError(null), []);

  return { ejecutar, reintentar, limpiar, cargando, error };
}
