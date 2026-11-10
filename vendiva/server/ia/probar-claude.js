// Prueba del Paso 0:  npm run probar:claude
//
// Hace UNA llamada muy pequeña a Claude para confirmar que la llave funciona.
// Nunca muestra la llave: solo dice si está puesta y si Anthropic la aceptó.
// Cuesta una fracción de centavo.

import { callClaude, parseClaudeJson, claudeConfigurado, ErrorIA, MODELO_POR_DEFECTO } from './claude.js';

if (!claudeConfigurado()) {
  console.log('Falta la llave. Ponla en la variable de entorno ANTHROPIC_API_KEY del servidor');
  console.log('(en tu computadora: en el archivo .env, que no se sube al repositorio).');
  console.log('No la pegues en ningún chat.');
  process.exit(1);
}

console.log(`Llave encontrada. Probando con el modelo ${process.env.ANTHROPIC_MODEL?.trim() || MODELO_POR_DEFECTO}…`);

try {
  const texto = await callClaude(
    [{ role: 'user', content: 'Responde solo con este JSON, sin nada más: {"listo": true, "saludo": "<un saludo corto en español>"}' }],
    { maxTokens: 1024, esfuerzo: 'low' },
  );
  const datos = parseClaudeJson(texto);
  if (datos?.listo !== true) throw new ErrorIA('JSON_INVALIDO', 'Claude respondió, pero no con el formato esperado.');
  console.log(`Conexión con Claude: funciona. Claude dijo: "${datos.saludo}"`);
} catch (err) {
  console.log(`Conexión con Claude: falló (${err.codigo ?? 'ERROR'}).`);
  console.log(err.message);
  if (err.cause?.status) console.log(`Detalle técnico: HTTP ${err.cause.status}`);
  process.exit(1);
}
