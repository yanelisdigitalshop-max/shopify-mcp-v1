/**
 * Error con mensaje pensado para la usuaria (español sencillo) y un código
 * estable para que el cliente decida qué mostrar.
 */
export class ErrorApp extends Error {
  constructor(estado, codigo, mensaje, extra = {}) {
    super(mensaje);
    this.name = 'ErrorApp';
    this.estado = estado;
    this.codigo = codigo;
    this.campos = extra.campos ?? null;
    this.datos = extra.datos ?? null;
  }
}

export const sinSesion = () =>
  new ErrorApp(401, 'SIN_SESION', 'Tu sesión se cerró. Entra de nuevo para seguir.');

export const noEncontrado = (que = 'Lo que buscas') =>
  new ErrorApp(404, 'NO_ENCONTRADO', `${que} ya no existe.`);
