// Ilustraciones hechas a medida para los estados vacíos (nada de emojis sueltos).
// Mismo trazo y misma paleta en todas: terracota, ámbar y crema.

const TRAZO = { stroke: '#9a3412', strokeWidth: 3, strokeLinejoin: 'round', strokeLinecap: 'round' };
const CREMA = '#ffedd5';
const DURAZNO = '#fdba74';
const AMBAR = '#f59e0b';

function Lienzo({ children, className = 'h-32 w-auto' }) {
  return (
    <svg viewBox="0 0 160 124" className={className} role="img" aria-hidden="true" fill="none">
      <ellipse cx="80" cy="112" rx="54" ry="7" fill="#fed7aa" opacity="0.55" />
      {children}
    </svg>
  );
}

function Destello({ x, y, t = 1 }) {
  return (
    <path
      transform={`translate(${x} ${y}) scale(${t})`}
      d="M0-10 2.6-2.6 10 0 2.6 2.6 0 10-2.6 2.6-10 0-2.6-2.6Z"
      fill={AMBAR}
    />
  );
}

/** Caja abierta: todavía no hay productos. */
export function IlustracionCaja(props) {
  return (
    <Lienzo {...props}>
      <path d="M42 56 80 43l38 13v36L80 106 42 92Z" fill={CREMA} {...TRAZO} />
      <path d="M42 56 80 70l38-14M80 70v36" {...TRAZO} />
      <path d="M42 56 29 43l38-13 13 13Z" fill={DURAZNO} {...TRAZO} />
      <path d="M118 56l13-13-38-13-13 13Z" fill={DURAZNO} {...TRAZO} />
      <path d="M61 81v9M99 81v9" {...TRAZO} strokeWidth={2.5} opacity="0.5" />
      <Destello x={80} y={16} />
      <Destello x={128} y={22} t={0.5} />
      <Destello x={34} y={24} t={0.4} />
    </Lienzo>
  );
}

/** Hoja de guion con un botón de grabar. */
export function IlustracionGuion(props) {
  return (
    <Lienzo {...props}>
      <rect x="44" y="18" width="62" height="84" rx="10" fill={CREMA} {...TRAZO} transform="rotate(-5 75 60)" />
      <rect x="54" y="14" width="62" height="84" rx="10" fill="#fff" {...TRAZO} />
      <path d="M66 32h24" {...TRAZO} stroke="#c2410c" strokeWidth={4} />
      <path d="M66 46h38M66 58h38M66 70h26" {...TRAZO} strokeWidth={2.5} opacity="0.45" />
      <circle cx="112" cy="86" r="17" fill="#c2410c" stroke="#9a3412" strokeWidth="3" />
      <path d="M107 78.5v15l13-7.5Z" fill="#fff7ed" />
      <Destello x={36} y={30} t={0.55} />
    </Lienzo>
  );
}

/** Vitrina de tienda con toldo y estrellas. */
export function IlustracionVitrina(props) {
  const estrella = 'M0-7 2.1-2.2 7-2.2 3-.9 4.4 5.7 0 2.6-4.4 5.7-3-.9-7-2.2-2.1-2.2Z';
  return (
    <Lienzo {...props}>
      <rect x="38" y="50" width="84" height="56" rx="6" fill={CREMA} {...TRAZO} />
      <path d="M32 50l8-22h80l8 22Z" fill={DURAZNO} {...TRAZO} />
      <path d="M32 50a12 12 0 0 0 24 0 12 12 0 0 0 24 0 12 12 0 0 0 24 0 12 12 0 0 0 24 0" fill="#fff" {...TRAZO} />
      <path d="M56 28l-4 22M80 28v22M104 28l4 22" {...TRAZO} strokeWidth={2.5} opacity="0.5" />
      <rect x="50" y="72" width="34" height="22" rx="4" fill="#fff" {...TRAZO} strokeWidth={2.5} />
      <rect x="94" y="72" width="18" height="34" rx="3" fill="#fff" {...TRAZO} strokeWidth={2.5} />
      <path transform="translate(59 83) scale(0.62)" d={estrella} fill={AMBAR} />
      <path transform="translate(67 83) scale(0.62)" d={estrella} fill={AMBAR} />
      <path transform="translate(75 83) scale(0.62)" d={estrella} fill={AMBAR} />
      <Destello x={132} y={24} t={0.5} />
    </Lienzo>
  );
}

/** Globo de conversación: la agente. */
export function IlustracionAgente(props) {
  return (
    <Lienzo {...props}>
      <path d="M36 34a14 14 0 0 1 14-14h60a14 14 0 0 1 14 14v34a14 14 0 0 1-14 14H76L58 98V82h-8a14 14 0 0 1-14-14Z" fill={CREMA} {...TRAZO} />
      <path
        d="M80 66c-9-6.2-14-11-14-16.6A7.4 7.4 0 0 1 80 46a7.4 7.4 0 0 1 14 3.4C94 55 89 59.800 80 66Z"
        fill="#c2410c"
        stroke="#9a3412"
        strokeWidth="2.5"
        strokeLinejoin="round"
      />
      <circle cx="122" cy="88" r="9" fill="#fff" {...TRAZO} strokeWidth={2.5} />
      <circle cx="136" cy="100" r="4.5" fill="#fff" {...TRAZO} strokeWidth={2.5} />
      <Destello x={30} y={22} t={0.5} />
    </Lienzo>
  );
}

/** Nube con el cable suelto: no hay conexión. */
export function IlustracionSinConexion(props) {
  return (
    <Lienzo {...props}>
      <path d="M52 84a20 20 0 0 1-2-39.900A28 28 0 0 1 104 38a23 23 0 0 1 6 46Z" fill={CREMA} {...TRAZO} />
      <path d="M68 62l8 8m0-8-8 8M88 62l8 8m0-8-8 8" {...TRAZO} stroke="#c2410c" />
      <path d="M72 100c5-5 11-5 16 0" {...TRAZO} strokeWidth={2.5} opacity="0.5" />
    </Lienzo>
  );
}
