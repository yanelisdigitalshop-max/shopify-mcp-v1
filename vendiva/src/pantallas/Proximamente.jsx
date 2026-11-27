// El Agente todavía no existe. Se dice tal cual: sin botones de adorno
// ni datos inventados.

import { EmptyState } from '../componentes/EmptyState.jsx';
import { IlustracionAgente } from '../componentes/Ilustraciones.jsx';
import { AunNo, Tarjeta } from '../componentes/base.jsx';

function Pendiente({ titulo, ilustracion, encabezado, texto }) {
  return (
    <div>
      <h1 className="text-3xl font-extrabold leading-tight tracking-tight text-stone-900">{titulo}</h1>
      <Tarjeta className="mt-5 p-5 md:p-8">
        <EmptyState ilustracion={ilustracion} marca={<AunNo />} titulo={encabezado} texto={texto} />
      </Tarjeta>
    </div>
  );
}

export function Agente() {
  return (
    <Pendiente
      titulo="Agente"
      ilustracion={IlustracionAgente}
      encabezado="Tu agente te va a acompañar paso a paso"
      texto="Te va a ayudar según tu nivel de seguidores y va a recordar lo que le cuentes. Llega cuando la IA esté conectada."
    />
  );
}
