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

      // Lo que escribe la IA. Los guiones son gratis; lo demás lleva el costo que ella aceptó en el aviso.
      crearGuiones: (productoId) => guardar(api.post(`/productos/${productoId}/guiones`, {}, { esperaMs: ESPERA_IA_MS })),
      crearEnVivo: (productoId, costoAceptado) =>
        guardar(api.post(`/productos/${productoId}/guion-en-vivo`, { costoAceptado }, { esperaMs: ESPERA_IA_MS })),
      crearRespuestas: (productoId, costoAceptado) =>
        guardar(api.post(`/productos/${productoId}/respuestas-comentarios`, { costoAceptado }, { esperaMs: ESPERA_IA_MS })),
    };
  }, []);

  useEffect(() => {
    acciones.cargar();
  }, [acciones]);

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
