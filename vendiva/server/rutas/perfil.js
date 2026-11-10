// Perfil: lo que la usuaria cuenta de sí misma y de su negocio.
// El registro paso a paso guarda cada pantalla con esta misma ruta.

import { Router } from 'express';
import { nivelPara } from '../../shared/datos.js';
import { ErrorApp, sinSesion } from '../errores.js';
import { validar, esquemaPerfil } from '../validacion.js';
import { exigirSesion } from '../auth/sesiones.js';
import { anotarHistorial, construirEstado } from '../servicios/estado.js';

// campo que manda el cliente -> columna
const EN_USUARIAS = { nombre: 'nombre', telefono: 'telefono' };
const EN_PERFILES = {
  nicho: 'nicho',
  seguidores: 'seguidores',
  modoGrabacion: 'modo_grabacion',
  objetivo: 'objetivo',
  usuarioTiktok: 'usuario_tiktok',
};

function armarUpdate(mapa, datos) {
  const columnas = [];
  const valores = [];
  for (const [campo, columna] of Object.entries(mapa)) {
    if (campo in datos) {
      valores.push(datos[campo]);
      columnas.push(`${columna} = $${valores.length + 1}`);
    }
  }
  return { columnas, valores };
}

export function rutasPerfil({ db, reloj }) {
  const r = Router();

  r.patch('/perfil', exigirSesion, async (req, res) => {
    const datos = validar(esquemaPerfil, req.body);
    const id = req.usuariaId;

    await db.tx(async (t) => {
      const actual = (await t.query('select * from perfiles where usuaria_id = $1 for update', [id])).rows[0];
      if (!actual) throw sinSesion();

      const u = armarUpdate(EN_USUARIAS, datos);
      if (u.columnas.length) {
        await t.query(`update usuarias set ${u.columnas.join(', ')}, actualizada_en = now() where id = $1`, [
          id,
          ...u.valores,
        ]);
      }

      const p = armarUpdate(EN_PERFILES, datos);
      if ('redes' in datos) {
        p.valores.push(JSON.stringify(datos.redes));
        p.columnas.push(`redes = $${p.valores.length + 1}::jsonb`);
      }
      if ('onboardingPaso' in datos) {
        // El registro solo avanza: volver atrás en pantalla no borra el avance guardado.
        p.valores.push(datos.onboardingPaso);
        p.columnas.push(`onboarding_paso = greatest(onboarding_paso, $${p.valores.length + 1})`);
      }

      if (datos.onboardingCompleto) {
        const final = { ...actual };
        for (const [campo, columna] of Object.entries(EN_PERFILES)) if (campo in datos) final[columna] = datos[campo];
        if (!final.nicho || !final.modo_grabacion || !final.objetivo) {
          throw new ErrorApp(400, 'REGISTRO_INCOMPLETO', 'Todavía faltan datos de tu negocio. Vuelve un paso atrás.');
        }
        p.columnas.push('onboarding_completo = true');
      }

      if (p.columnas.length) {
        await t.query(`update perfiles set ${p.columnas.join(', ')}, actualizado_en = now() where usuaria_id = $1`, [
          id,
          ...p.valores,
        ]);
      }

      if ('seguidores' in datos && datos.seguidores !== actual.seguidores) {
        await anotarHistorial(t, id, 'seguidores_actualizados', {
          antes: actual.seguidores,
          ahora: datos.seguidores,
          nivelAntes: nivelPara(actual.seguidores).numero,
          nivelAhora: nivelPara(datos.seguidores).numero,
        });
      }
      if (datos.onboardingCompleto && !actual.onboarding_completo) {
        await anotarHistorial(t, id, 'registro_completo');
      }
    });

    res.json({ estado: await construirEstado(db, id, reloj()) });
  });

  return r;
}
