import type { Guion } from "./tipos";

/* ─────────────────────────────  SOFI  ─────────────────────────────
   La llamada grabada: Sofi llama a don Andrés, del Restaurante Sancho
   Paisa, que pidió una cotización por WhatsApp hace tres semanas y no
   volvió a escribir.

   Por qué existe un guion si el agente en vivo funciona: el vídeo se graba
   en varias tomas y una conversación con un modelo no sale dos veces igual.
   Esta sale idéntica siempre, con el audio ya generado en `public/sofi/audio`
   (`npm run sofi:grabar`). Es también la red de seguridad si en directo
   falla el micrófono o la conexión.

   Los eventos se disparan cuando el turno termina de sonar: la ficha se
   llena un instante después de que el cliente dice la cosa, como haría
   alguien que anota mientras escucha.

   El total: 12 canecas × 112.400 + 10 bultos × 139.000 + 20 pacas × 32.500
   = 3.388.800. Con el diez por ciento, 3.049.920.
   ------------------------------------------------------------------ */

export const GUION_SANCHO_PAISA: Guion = {
  cotizacionId: "cot-041",
  turnos: [
    {
      id: "t01",
      quien: "sofi",
      texto: "¡Aló, buenas! ¿Hablo con don Andrés, el del Sancho Paisa?",
    },
    {
      id: "t02",
      quien: "cliente",
      texto: "Sí, con él. ¿Quién habla?",
    },
    {
      id: "t03",
      quien: "sofi",
      texto:
        "¡Ay, qué bueno! Don Andrés, le habla Sofi, de Distribuidora Andina. ¿Cómo le ha ido? ¿Lo cojo en buen momento?",
    },
    {
      id: "t04",
      quien: "cliente",
      texto: "Bien, bien, gracias. Estoy en el restaurante, pero dígame.",
    },
    {
      id: "t05",
      quien: "sofi",
      texto:
        "Súper, no me demoro nadita. Le cuento: vi que hace como tres semanas nos pidió una cotización por WhatsApp, la del aceite de veinte litros, el arroz y las servilletas… y ahí quedó. Y me dio curiosidad: ¿qué pasó? ¿Se le enredó algo o no le convenció?",
    },
    {
      id: "t06",
      quien: "cliente",
      texto:
        "Ah, sí, me acuerdo. No, es que la vi un poquito subida. El aceite me lo dejan más barato en la Minorista, y pues… uno se acostumbra al proveedor de siempre.",
      eventos: [
        { tipo: "dato", dato: { campo: "motivo", valor: "Precio: vio el aceite por encima de lo que paga hoy" } },
        { tipo: "dato", dato: { campo: "proveedor", valor: "Un mayorista de la Minorista, compra semanal" } },
      ],
    },
    {
      id: "t07",
      quien: "sofi",
      texto:
        "Claro, lo entiendo perfectamente, uno no cambia de proveedor por cambiar. Y más o menos, ¿cuántas canecas se les van al mes ahí en el restaurante?",
    },
    {
      id: "t08",
      quien: "cliente",
      texto: "Uy, unas doce, catorce canecas. Y de arroz, unos diez bultos.",
      eventos: [{ tipo: "dato", dato: { campo: "volumen", valor: "12 a 14 canecas de aceite y 10 bultos de arroz" } }],
    },
    {
      id: "t09",
      quien: "sofi",
      texto:
        "Ah, o sea que ustedes venden bien, ¡qué rico! Mire, entonces le cuento por qué lo llamé: tengo autorizado un diez por ciento en el primer pedido para los que cotizaron y no alcanzaron a comprar. Con eso el aceite le queda más barato que en la Minorista, y se lo llevamos hasta Laureles sin cobrarle el envío. O sea, ni tiene que mandar a nadie a recogerlo.",
      eventos: [
        {
          tipo: "accion",
          accion: { tipo: "descuento", cuando: "En este pedido", detalle: "10 % autorizado y envío gratis a Laureles" },
        },
      ],
    },
    {
      id: "t10",
      quien: "cliente",
      texto: "Mmm… ¿y eso me quedaría en cuánto?",
    },
    {
      id: "t11",
      quien: "sofi",
      texto:
        "Le quedaría en tres millones cuarenta y nueve mil, ya con todo: las doce canecas, los diez bultos y las veinte pacas de servilletas. Y si me confirma hoy, mañana viernes antes de las once ya lo tiene en el restaurante.",
      eventos: [{ tipo: "dato", dato: { campo: "entrega", valor: "Viernes antes de las 11:00, en el restaurante (Laureles)" } }],
    },
    {
      id: "t12",
      quien: "cliente",
      texto: "Ah, bueno, eso ya suena distinto. Es que el arroz sí lo necesito para el fin de semana.",
    },
    {
      id: "t13",
      quien: "sofi",
      texto: "¡Pues le llegó justo! Don Andrés, ¿y usted es el que decide o tiene que consultarlo con alguien?",
    },
    {
      id: "t14",
      quien: "cliente",
      texto: "No, no, eso lo decido yo, aquí el que manda soy yo. Hágale pues, mándeme eso al WhatsApp y despache.",
      voz: "No, no, eso lo decido yo, aquí el que manda soy yo. [laughs] Hágale pues, mándeme eso al WhatsApp y despache.",
      eventos: [
        { tipo: "dato", dato: { campo: "decisor", valor: "Andrés decide solo" } },
        { tipo: "dato", dato: { campo: "canal", valor: "WhatsApp, el mismo de la cotización" } },
        {
          tipo: "cierre",
          cierre: { resultado: "pedido_cerrado", resumen: "Pedido completo con 10 % · despacho viernes 11:00", monto: 3_049_920 },
        },
        {
          tipo: "accion",
          accion: { tipo: "whatsapp", cuando: "Ahora", detalle: "Confirmación del pedido y total al 310 452 88 17" },
        },
        {
          tipo: "accion",
          accion: { tipo: "despacho", cuando: "Viernes antes de 11:00", detalle: "12 canecas, 10 bultos y 20 pacas a Laureles" },
        },
      ],
    },
    {
      id: "t15",
      quien: "sofi",
      texto:
        "¡Ay, qué nota, don Andrés! Ya mismo le mando la confirmación al WhatsApp con el pedido y el total. Ah, y una cosita: ¿ustedes el queso y los lácteos con quién los trabajan?",
    },
    {
      id: "t16",
      quien: "cliente",
      texto: "Eso lo compro aparte, con otro señor que me lo trae los martes.",
      eventos: [
        {
          tipo: "dato",
          dato: { campo: "oportunidad", valor: "Quesos y lácteos se los trae otro proveedor los martes" },
        },
      ],
    },
    {
      id: "t17",
      quien: "sofi",
      texto:
        "Listo, entonces la otra semana le mando la lista de lácteos sin compromiso, para que compare. Don Andrés, mil gracias. Quedamos así: mañana antes de las once le llega el pedido. ¡Que le vaya muy bien y buenas ventas!",
      eventos: [
        { tipo: "accion", accion: { tipo: "lista", cuando: "Lunes", detalle: "Lista de quesos y lácteos por WhatsApp" } },
        { tipo: "accion", accion: { tipo: "llamada", cuando: "Martes 9:30", detalle: "Seguimiento: cómo llegó el pedido y lácteos" } },
      ],
    },
    {
      id: "t18",
      quien: "cliente",
      texto: "Bueno, Sofi, muchas gracias. Hasta luego.",
    },
    {
      id: "t19",
      quien: "sofi",
      texto: "¡Chao, chao!",
    },
  ],
};

export const GUIONES: Record<string, Guion> = {
  [GUION_SANCHO_PAISA.cotizacionId]: GUION_SANCHO_PAISA,
};

export const rutaAudio = (turnoId: string) => `/sofi/audio/${turnoId}.mp3`;
