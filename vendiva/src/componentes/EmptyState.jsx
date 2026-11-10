// Estado vacío cuidado: ilustración propia, una frase clara y un solo paso siguiente.

export function EmptyState({ ilustracion: Ilustracion, titulo, texto, accion, marca, className = '' }) {
  return (
    <div className={`flex flex-col items-center px-2 py-6 text-center ${className}`}>
      {Ilustracion && <Ilustracion className="h-32 w-auto" />}
      {marca && <div className="mt-3">{marca}</div>}
      <h3 className="mt-3 text-xl font-bold tracking-tight text-stone-900">{titulo}</h3>
      {texto && <p className="mt-1.5 max-w-sm text-base leading-relaxed text-stone-600">{texto}</p>}
      {accion && <div className="mt-5 w-full max-w-xs">{accion}</div>}
    </div>
  );
}
