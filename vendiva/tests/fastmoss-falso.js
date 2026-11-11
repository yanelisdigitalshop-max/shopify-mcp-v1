// Un FastMoss de mentira para las pruebas: no llama a nadie y anota cada llamada.
import { productoDeBusqueda, productoDeRanking } from '../server/fuentes/fastmoss.js';
import { ErrorFastmoss } from '../server/fuentes/fastmoss.js';

/** Lo que devolvería FastMoss en /product/v1/search, con su formato real. */
export function crudoBusqueda(n = 10) {
  return Array.from({ length: n }, (_, i) => ({
    product_id: `17295144748401691${String(i).padStart(2, '0')}`,
    title: `Cepillo alisador de prueba ${i + 1}`,
    region: 'US',
    cover: `https://s.500fd.com/tt_product/foto${i}.jpeg`,
    commission_rate: `${10 + i}%`,
    price: `$${(14.99 + i).toFixed(2)}`,
    floor_price: 14.99 + i,
    day7_units_sold: 1000 - i * 50,
    total_units_sold: 20000 - i * 900,
    product_rating: 4.6,
    tiktok_url: '',
    shop: { seller_id: 7, name: `Tienda ${i + 1}`, avatar: 'x', total_units_sold: 5 },
  }));
}

export function crudoRanking(n = 10) {
  return Array.from({ length: n }, (_, i) => ({
    product_id: `17295376658910785${String(i).padStart(2, '0')}`,
    title: `Vaso de vidrio con tapa ${i + 1}`,
    cover: `https://s.500fd.com/tt_product/r${i}.jpeg`,
    real_price: '$10.94',
    region: 'US',
    commission_rate: 1234,
    units_sold: 5000 - i * 300,
    gmv: 1,
    total_units_sold: 90000,
    total_gmv: 1,
    growth_rate: 12,
    shop: { seller_id: 1, name: `Tienda ranking ${i + 1}` },
  }));
}

export function crearFastmossFalso() {
  const llamadas = [];
  const control = { lista: true, resultados: 10, fallar: null, vacioSemanas: new Set(), demoraMs: 0 };
  const esperar = () => (control.demoraMs ? new Promise((ok) => setTimeout(ok, control.demoraMs)) : null);
  return {
    llamadas,
    control,
    lista: () => control.lista,
    async buscarProductos(consulta) {
      llamadas.push({ tipo: 'buscar', consulta });
      await esperar();
      if (control.fallar) throw control.fallar;
      const productos = crudoBusqueda(control.resultados).map(productoDeBusqueda);
      return { total: productos.length ? 4321 : 0, productos };
    },
    async masVendidosDeLaSemana(semana) {
      llamadas.push({ tipo: 'tendencias', semana });
      await esperar();
      if (control.fallar) throw control.fallar;
      if (control.vacioSemanas.has(semana)) return { productos: [] };
      return { productos: crudoRanking(10).map(productoDeRanking) };
    },
  };
}

export const errorOcupado = () => new ErrorFastmoss('FASTMOSS_OCUPADO', 'El buscador está muy ocupado. Intenta de nuevo en un minuto.', { reintentable: true });
