import type { Metadata } from "next";
import Sofi from "@/components/sofi/Sofi";

export const metadata: Metadata = {
  title: "Sofi · Recupera las cotizaciones que se enfriaron",
  description:
    "Llama a quien pidió una cotización y nunca compró, cierra el pedido y deja la ficha del cliente llena.",
};

/**
 * El teléfono de Sofi Restrepo (sls-08, Ventas). Como el resto de pantallas,
 * la página es un envoltorio: toda la lógica vive en el componente.
 */
export default function Page() {
  return <Sofi />;
}
