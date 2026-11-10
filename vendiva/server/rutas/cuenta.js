// Cuentas: crear, entrar, salir y leer el estado.

import crypto from 'node:crypto';
import { Router } from 'express';
import { rateLimit } from 'express-rate-limit';
import { PLANES, PLAN_INICIAL } from '../../shared/datos.js';
import { ErrorApp } from '../errores.js';
import { validar, esquemaRegistro, esquemaEntrar } from '../validacion.js';
import { crearHash, verificarHash, hashDesactualizado } from '../auth/contrasenas.js';
import { abrirSesion, cerrarSesion, exigirSesion } from '../auth/sesiones.js';
import { anotarMovimiento, periodoDe } from '../servicios/creditos.js';
import { anotarHistorial, construirEstado } from '../servicios/estado.js';

const CORREO_EN_USO = () =>
  new ErrorApp(409, 'CORREO_EN_USO', 'Ya hay una cuenta con ese correo. Prueba entrar con tu contraseña.', {
    campos: { correo: 'Ya hay una cuenta con ese correo.' },
  });

const NO_COINCIDEN = () =>
  new ErrorApp(401, 'CREDENCIALES', 'El correo o la contraseña no coinciden. Revísalos e intenta otra vez.');

export function rutasCuenta({ db, config, reloj }) {
  const r = Router();

  const freno = (opciones) =>
    config.limitarPeticiones
      ? rateLimit({
          standardHeaders: 'draft-8',
          legacyHeaders: false,
          handler: (_req, _res, next) =>
            next(new ErrorApp(429, 'DEMASIADOS_INTENTOS', 'Fueron muchos intentos seguidos. Espera unos minutos y prueba otra vez.')),
          ...opciones,
        })
      : (_req, _res, next) => next();

  const frenoPorIp = freno({ windowMs: 15 * 60 * 1000, limit: 20 });
  // Además, por correo: frena a quien prueba contraseñas contra una misma cuenta.
  const frenoPorCorreo = freno({
    windowMs: 60 * 60 * 1000,
    limit: 15,
    skipSuccessfulRequests: true,
    keyGenerator: (req) => `correo:${String(req.body?.correo ?? '').trim().toLowerCase().slice(0, 254)}`,
  });

  // Hash de mentira para tardar lo mismo cuando el correo no existe
  // (así no se puede adivinar qué correos tienen cuenta midiendo el tiempo).
  let hashSenuelo = null;

  r.post('/cuenta/registro', frenoPorIp, async (req, res) => {
    const datos = validar(esquemaRegistro, req.body);
    const id = crypto.randomUUID();
    const hash = await crearHash(datos.contrasena, config.scrypt);
    const periodo = periodoDe(reloj());
    const creditos = PLANES[PLAN_INICIAL].creditosMes;

    try {
      await db.tx(async (t) => {
        const existe = await t.query('select 1 from usuarias where correo = $1', [datos.correo]);
        if (existe.rows.length) throw CORREO_EN_USO();

        await t.query(
          `insert into usuarias (id, correo, contrasena_hash, nombre, telefono, plan, creditos_plan, periodo_creditos, mayor_de_edad_confirmada_en)
           values ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
          // La validación ya exigió la casilla de 18 años; se guarda el momento en que la marcó.
          [id, datos.correo, hash, datos.nombre, datos.telefono, PLAN_INICIAL, creditos, periodo, reloj()],
        );
        await t.query('insert into perfiles (usuaria_id) values ($1)', [id]);
        await anotarMovimiento(t, { usuariaId: id, bolsa: 'plan', cantidad: creditos, motivo: 'alta', periodo });
        await anotarHistorial(t, id, 'cuenta_creada', { plan: PLAN_INICIAL });
      });
    } catch (err) {
      // Dos registros a la vez con el mismo correo: gana uno, el otro recibe el aviso.
      if (err?.code === '23505') throw CORREO_EN_USO();
      throw err;
    }

    await abrirSesion(db, config, req, res, id);
    res.status(201).json({ estado: await construirEstado(db, id, reloj()) });
  });

  r.post('/cuenta/entrar', frenoPorIp, frenoPorCorreo, async (req, res) => {
    const datos = validar(esquemaEntrar, req.body);
    const { rows } = await db.query('select id, contrasena_hash from usuarias where correo = $1', [datos.correo]);
    const usuaria = rows[0];

    if (!usuaria) {
      hashSenuelo ??= await crearHash(crypto.randomBytes(12).toString('hex'), config.scrypt);
      await verificarHash(datos.contrasena, hashSenuelo);
      throw NO_COINCIDEN();
    }
    if (!(await verificarHash(datos.contrasena, usuaria.contrasena_hash))) throw NO_COINCIDEN();

    if (hashDesactualizado(usuaria.contrasena_hash, config.scrypt)) {
      const nuevo = await crearHash(datos.contrasena, config.scrypt);
      await db.query('update usuarias set contrasena_hash = $2 where id = $1', [usuaria.id, nuevo]);
    }

    await abrirSesion(db, config, req, res, usuaria.id);
    res.json({ estado: await construirEstado(db, usuaria.id, reloj()) });
  });

  r.post('/cuenta/salir', async (req, res) => {
    await cerrarSesion(db, config, req, res);
    res.json({ ok: true });
  });

  r.get('/estado', exigirSesion, async (req, res) => {
    res.json({ estado: await construirEstado(db, req.usuariaId, reloj()) });
  });

  return r;
}
