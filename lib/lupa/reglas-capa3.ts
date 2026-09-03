/* ──────────────────  CAPA 3 · ANOMALÍAS ESTADÍSTICAS  ──────────────────
   Esta capa no mira documentos: mira la FORMA de los datos. El primer
   dígito de los importes, la hora a la que se teclea, el peso de cada
   proveedor trimestre a trimestre, cuánto se sale un importe del histórico
   de su propio tercero.

   Y por eso es la capa que hay que enseñar con más cuidado. Un chi-cuadrado
   alto no es un fraude: es una serie que no tiene la forma que uno esperaría.
   Nada de aquí pasa de amarillo por sí solo —eso lo sabe el motor— y nada de
   aquí suma al total del informe: el `montoEnRiesgo` que devuelven estas
   reglas es VOLUMEN OBSERVADO, la cifra que se movió en el patrón, no una
   fuga probada. Se enseña aparte y con esa etiqueta.

   El valor de la capa 3 no es acusar: es decir por dónde empezar a mirar, y
   sobre todo confirmar lo que las capas 1 y 2 ya encontraron por otro camino.
   Cuando el mismo proveedor sale en la capa 1 por no tener orden de compra y
   en la capa 3 por aparecer de la nada en el gasto del trimestre, ya no son
   dos indicios: es el mismo, visto dos veces. Por eso varias reglas de aquí
   ponen como sujeto al TERCERO y no al usuario: es lo que permite que el
   hallazgo compuesto los junte.

   `evidenciaCompleta` va a true: lo que se observa —la hora del registro, el
   dígito del importe, el peso del trimestre— está trazado a su fila del Excel.
   Que el hecho esté cerrado no lo convierte en fuga, y de eso ya se encarga el
   techo de capa que aplica el motor.
   -------------------------------------------------------------------- */

import {
  conHallazgos,
  evidenciaDocumento,
  limpia,
  sujetoTercero,
  sujetoUsuario,
  type HallazgoCrudo,
  type Indice,
  type Regla,
} from "./indice";
import { cop, decimal, fecha, fechaHora, fechaLarga, numero, pctL, trimestreDe } from "./moneda";
import type { Documento, Serie, TipoDocumento } from "./tipos";

/* ─────────────────────────────  Umbrales  ───────────────────────────── */

/**
 * R40 · χ² con 8 grados de libertad al 5 %. Por debajo de esto la desviación
 * cabe dentro del azar y decirlo sería inventar una señal.
 */
const R40_CHI2 = 15.507;
/** Benford no dice nada de una serie corta: por debajo de 150 documentos, no se evalúa. */
const R40_MINIMO_DOCS = 150;
/** Un dígito con menos de este exceso en puntos porcentuales no se menciona. */
const R40_EXCESO_PUNTOS = 1.5;

/** R41 · la franja peligrosa: lo bastante alto para ser una compra de verdad,
    lo bastante bajo para no necesitar una firma. */
const R41_FRANJA_INFERIOR = 0.85;
/** «Redondo» es múltiplo de cien mil pesos: nadie negocia hasta ahí por azar. */
const R41_REDONDEO = 100_000;
const R41_MINIMO_DOCS = 3;

/** R43 · desviaciones típicas sobre la media del propio tercero. */
const R43_Z = 3;
/** Con menos de ocho facturas, la media y la desviación son las de nada. */
const R43_MINIMO_HISTORICO = 8;

/** R44 · puntos porcentuales de participación en el gasto entre trimestres. */
const R44_PUNTOS = 4;
/**
 * El informe no es un listado de participación por proveedor: es un informe. Se
 * enseñan los cuatro movimientos más grandes y el resto queda contado en
 * `revisados`. Los proveedores que aparecen de la nada van primero, porque esa
 * es la forma que la regla busca de verdad.
 */
const R44_MAXIMOS = 4;
/**
 * La otra forma que busca la regla: un proveedor DADO DE ALTA dentro del período
 * que ya aparece en el gasto. No llega a los cuatro puntos casi nunca —empieza
 * de cero, difícilmente pesa tanto en su primer trimestre— y, sin embargo, es el
 * movimiento más interesante de los dos.
 *
 * La condición dura es la fecha de alta, no el «el trimestre pasado no le
 * compramos»: sin ella, cualquier proveedor estacional al que se le compra dos
 * veces al año dispara la regla y el hallazgo deja de significar nada.
 */
const R44_NUEVO_MONTO = 5_000_000;
const R44_NUEVO_FACTURAS = 2;

/** R45 · cuánto puede acumular una sola persona antes de que sea un control. */
const R45_CONCENTRACION_PCT = 40;
/** Con menos de tres personas emitiendo, la concentración es aritmética, no hallazgo. */
const R45_MINIMO_USUARIOS = 3;

const MAX_EVIDENCIA = 12;

/* ─────────────────────────────  Ayudantes  ───────────────────────────── */

function agrupar<T>(lista: T[], clave: (x: T) => string): Map<string, T[]> {
  const mapa = new Map<string, T[]>();
  for (const x of lista) {
    const k = clave(x);
    const previo = mapa.get(k);
    if (previo) previo.push(x);
    else mapa.set(k, [x]);
  }
  return mapa;
}

const porClave = <T>(mapa: Map<string, T>): [string, T][] =>
  [...mapa.entries()].sort((a, b) => a[0].localeCompare(b[0]));

const primeras = <T>(lista: T[], n = MAX_EVIDENCIA): T[] => lista.slice(0, n);

/** El primer dígito significativo, por texto: con floats, dividir entre 10 en
    bucle acaba dando 3,9999 donde había un 4. */
function primerDigito(monto: number): number {
  const texto = String(Math.round(Math.abs(monto)));
  return Number(texto[0]);
}

/** "el 4", "el 4 y el 9", "el 4, el 9 y el 7". */
function listaDigitos(digitos: number[]): string {
  const partes = digitos.map((d) => `el ${d}`);
  if (partes.length === 1) return partes[0];
  return `${partes.slice(0, -1).join(", ")} y ${partes[partes.length - 1]}`;
}

const comprasVigentes = (ix: Indice): Documento[] =>
  ix.porTipo("factura_compra").filter((d) => d.estado !== "anulado" && d.montoTotal > 0);

/* ══════════════════════════════════════════════════════════════════════
   R40 · Ley de Benford
   ══════════════════════════════════════════════════════════════════════ */

const R40: Regla = ({ ix }) => {
  const docs = comprasVigentes(ix);
  if (docs.length < R40_MINIMO_DOCS) return limpia(docs.length);

  const n = docs.length;
  const observadoN = new Array<number>(9).fill(0);
  for (const d of docs) observadoN[primerDigito(d.montoTotal) - 1]++;

  // Benford: P(d) = log10(1 + 1/d). El χ² se calcula sobre CUENTAS, que es lo
  // que exige el contraste; a la pantalla van los porcentajes, que es lo que
  // se puede leer.
  const esperadoPct = Array.from({ length: 9 }, (_, i) => Math.log10(1 + 1 / (i + 1)) * 100);
  const esperadoN = esperadoPct.map((p) => (p * n) / 100);
  const observadoPct = observadoN.map((c) => (c * 100) / n);
  const chi2 = observadoN.reduce((s, o, i) => s + (o - esperadoN[i]) ** 2 / esperadoN[i], 0);

  const serie: Serie = {
    clase: "benford",
    observado: observadoPct.map((p) => Math.round(p * 10) / 10),
    esperado: esperadoPct.map((p) => Math.round(p * 10) / 10),
    chi2: Math.round(chi2 * 10) / 10,
    n,
  };

  if (chi2 <= R40_CHI2) return limpia(n);

  const excesos = observadoPct
    .map((p, i) => ({
      digito: i + 1,
      exceso: p - esperadoPct[i],
      observado: p,
      esperado: esperadoPct[i],
    }))
    .filter((e) => e.exceso >= R40_EXCESO_PUNTOS)
    .sort((a, b) => b.exceso - a.exceso);
  if (!excesos.length) return limpia(n);

  const principal = excesos[0];
  const digitosQueSobran = new Set(excesos.map((e) => e.digito));
  const delDigito = docs.filter((d) => primerDigito(d.montoTotal) === principal.digito);
  const deLosQueSobran = docs.filter((d) => digitosQueSobran.has(primerDigito(d.montoTotal)));

  // El grupo de importes idénticos más grande de entre los dígitos que sobran.
  // Casi siempre es la explicación entera de la desviación, y enseñarlo primero
  // evita que el χ² se lea como una acusación. Se busca en todos los dígitos
  // sobrerrepresentados y no solo en el mayor: seis órdenes por el mismo importe
  // explican mucho aunque su dígito quede segundo en la tabla.
  const racimos = porClave(agrupar(deLosQueSobran, (d) => String(Math.round(d.montoTotal))))
    .map(([importe, ds]) => ({ importe: Number(importe), docs: ds }))
    .sort((a, b) => b.docs.length - a.docs.length || b.importe - a.importe);
  const racimo = racimos.length && racimos[0].docs.length >= 3 ? racimos[0] : null;

  const señalados = racimo ? racimo.docs : delDigito;
  const volumen = señalados.reduce((s, d) => s + d.montoTotal, 0);
  const sobran = listaDigitos(excesos.map((e) => e.digito));

  return conHallazgos(n, [
    {
      titulo: `El primer dígito de las ${numero(n)} facturas de compra se aparta de la ley de Benford (χ² ${decimal(chi2)}): ${
        excesos.length === 1 ? "sobra" : "sobran"
      } ${sobran}`,
      resumen:
        `Sobre ${numero(n)} facturas de compra, el dígito ${principal.digito} encabeza el ${pctL(principal.observado)} de los ` +
        `importes cuando la distribución de Benford esperaría un ${pctL(principal.esperado)}. El chi-cuadrado del conjunto ` +
        `es ${decimal(chi2)}, por encima del ${decimal(R40_CHI2)} que marca el 5 % de significancia con 8 grados de libertad` +
        `${
          racimo
            ? `. Dentro de ese dígito, ${numero(racimo.docs.length)} documentos comparten el importe exacto de ${cop(racimo.importe)}, ${cop(volumen)} en total`
            : `. El volumen que cae en ese dígito es de ${cop(volumen)}`
        }.`,
      // Volumen observado, no fuga: la capa 3 no aporta al total del informe.
      montoEnRiesgo: Math.round(volumen),
      montoExacto: true,
      documentos: señalados.map((d) => d.id),
      evidencia: primeras([...señalados].sort((a, b) => b.montoTotal - a.montoTotal || a.id.localeCompare(b.id))).map(
        (d) => evidenciaDocumento(ix, d, `Importe que empieza por ${principal.digito}`),
      ),
      quePuedeEstarPasando: [
        "La serie es homogénea por naturaleza: si se compra siempre el mismo catálogo a precios de lista, los importes se repiten y Benford se desvía sola, sin que haya nada detrás.",
        racimo
          ? `Puede que todo el exceso lo explique un solo grupo: hay ${numero(racimo.docs.length)} documentos por el mismo importe de ${cop(racimo.importe)}. Conviene mirar ese grupo antes que la serie entera —si esos documentos tienen sustento, el χ² deja de decir nada.`
          : "Puede que el exceso lo explique un grupo pequeño de importes repetidos y no la serie entera; conviene aislarlo antes de sacar conclusiones.",
        "Puede haber documentos partidos: una compra grande registrada en varios trozos aparece varias veces con el mismo dígito de cabecera.",
        "Puede haber importes construidos a mano para quedarse justo por debajo de un tope de autorización, que es lo que mira la regla siguiente.",
      ],
      queRevisar: [
        racimo
          ? `Empieza por los ${numero(racimo.docs.length)} documentos de ${cop(racimo.importe)}: mira si son del mismo proveedor y de las mismas fechas.`
          : `Aísla las facturas cuyo importe empieza por ${principal.digito} y mira si se concentran en pocos proveedores.`,
        "Repite el contraste quitando ese grupo: si el χ² cae por debajo del umbral, la desviación estaba explicada.",
        "Cruza el resultado con la regla de compra fraccionada y con la de montos redondos bajo el umbral.",
      ],
      controlSugerido:
        "Contraste de Benford mensual sobre las compras del mes, con alerta solo cuando el dígito que sobra no se explique por un grupo de importes idénticos.",
      sujeto: null,
      serie,
      repeticiones: señalados.length,
      evidenciaCompleta: true,
    },
  ]);
};

/* ══════════════════════════════════════════════════════════════════════
   R41 · Montos redondos bajo el umbral de aprobación
   ══════════════════════════════════════════════════════════════════════ */

const R41: Regla = ({ ix }) => {
  const umbral = ix.politicas.umbralAprobacion;
  const suelo = umbral * R41_FRANJA_INFERIOR;
  const candidatos = [...ix.porTipo("orden_compra"), ...ix.porTipo("factura_compra")].filter(
    (d) => d.estado !== "anulado",
  );

  const franja = candidatos.filter(
    (d) => d.montoTotal >= suelo && d.montoTotal < umbral && Math.round(d.montoTotal) % R41_REDONDEO === 0,
  );
  // Una orden de compra y la factura que la ejecuta son la MISMA compra: contar
  // las dos convertiría seis compras de 4.800.000 en doce y doblaría el monto.
  // Manda la orden, que es el documento donde se decidió el importe.
  const ordenes = new Set(franja.filter((d) => d.tipo === "orden_compra").map((d) => d.id));
  const enFranja = franja.filter((d) => !(d.ordenCompraId && ordenes.has(d.ordenCompraId)));
  if (!enFranja.length) return limpia(candidatos.length);

  const hallazgos: HallazgoCrudo[] = [];
  for (const [terceroId, docs] of porClave(agrupar(enFranja, (d) => d.terceroId ?? "sin tercero"))) {
    if (docs.length < R41_MINIMO_DOCS) continue;
    const ordenados = [...docs].sort((a, b) => a.fecha.localeCompare(b.fecha) || a.id.localeCompare(b.id));
    const volumen = ordenados.reduce((s, d) => s + d.montoTotal, 0);
    const importes = [...new Set(ordenados.map((d) => Math.round(d.montoTotal)))];
    const mismoImporte = importes.length === 1;
    const tercero = ix.tercero.get(terceroId);
    const pctUmbral = (ordenados[0].montoTotal / umbral) * 100;

    const serie: Serie = {
      clase: "barras",
      puntos: primeras(ordenados).map((d) => ({
        etiqueta: d.numero,
        valor: Math.round(d.montoTotal),
        marcado: true,
      })),
      unidad: "dinero",
    };

    hallazgos.push({
      titulo: mismoImporte
        ? `${numero(ordenados.length)} documentos de ${cop(importes[0])} a ${ix.nombre(terceroId)}, justo bajo el tope de firma de ${cop(umbral)}`
        : `${numero(ordenados.length)} documentos redondos a ${ix.nombre(terceroId)} entre ${cop(Math.min(...importes))} y ${cop(Math.max(...importes))}, todos bajo el tope de ${cop(umbral)}`,
      resumen:
        `${numero(ordenados.length)} documentos de compra a ${ix.nombre(terceroId)} caen en la franja del ` +
        `${pctL(R41_FRANJA_INFERIOR * 100)} al 100 % del umbral de aprobación (${cop(suelo)}–${cop(umbral)}) y todos son ` +
        `múltiplos de ${cop(R41_REDONDEO)}. ${
          mismoImporte
            ? `Los ${numero(ordenados.length)} son por el mismo importe exacto de ${cop(importes[0])}, el ${pctL(pctUmbral)} del umbral. `
            : ""
        }Entre el ${fecha(ordenados[0].fecha)} y el ${fecha(ordenados[ordenados.length - 1].fecha)} suman ${cop(volumen)}, ` +
        `por encima del umbral que habría exigido una firma.`,
      montoEnRiesgo: Math.round(volumen),
      montoExacto: true,
      documentos: ordenados.map((d) => d.id),
      evidencia: primeras(ordenados).map((d) =>
        evidenciaDocumento(ix, d, `${pctL((d.montoTotal / umbral) * 100)} del umbral de aprobación · importe redondo`),
      ),
      quePuedeEstarPasando: [
        "Son compras de catálogo con precio de lista redondo y coincidencia de importe; ocurre, sobre todo en servicios contratados por paquete.",
        "El proveedor cotiza en cifras redondas y la empresa compra en tandas del mismo tamaño por logística.",
        "Se está partiendo una compra grande en trozos que pasan solos, porque el sistema mira el importe del documento y no el del proveedor en el día.",
        "El importe se está eligiendo mirando el tope: quedarse a un 96 % de la firma no suele ser casualidad.",
      ],
      queRevisar: [
        `Mira si estos ${numero(ordenados.length)} documentos son del mismo día o de la misma semana: si lo son, es una sola compra partida.`,
        "Pide la cotización y la necesidad que sustentan cada uno por separado.",
        `Comprueba si a ${ix.nombre(terceroId)} se le ha hecho alguna compra por encima de ${cop(umbral)} en el período: si nunca, el patrón se explica solo.`,
      ],
      controlSugerido: `Que el umbral de ${cop(umbral)} se evalúe sobre el acumulado del proveedor en 30 días, no sobre el documento suelto.`,
      sujeto: tercero ? sujetoTercero(tercero) : null,
      serie,
      repeticiones: ordenados.length,
      evidenciaCompleta: true,
    });
  }

  hallazgos.sort((a, b) => b.montoEnRiesgo - a.montoEnRiesgo);
  return conHallazgos(candidatos.length, hallazgos);
};

/* ══════════════════════════════════════════════════════════════════════
   R42 · Registros fuera de horario
   ══════════════════════════════════════════════════════════════════════ */

/**
 * Festivos de Colombia de 2025 y 2026, escritos a mano y a propósito.
 *
 * Casi todos son móviles: la Ley Emiliani corre al lunes siguiente los que no
 * caen en lunes, y los de Semana Santa y Corpus dependen de la Pascua. Calcular
 * eso en tiempo de ejecución sería una fuente de fallos silenciosos para
 * ahorrarse treinta y cinco líneas, y encima habría que revisarlo igual. La
 * lista se lee, se comprueba contra el calendario y no se mueve entre tomas.
 */
const FESTIVOS_CO = new Set<string>([
  // 2025 — Pascua el 20 de abril
  "2025-01-01", // Año Nuevo
  "2025-01-06", // Reyes (6 de enero, lunes)
  "2025-03-24", // San José (19 de marzo → lunes 24)
  "2025-04-17", // Jueves Santo
  "2025-04-18", // Viernes Santo
  "2025-05-01", // Día del Trabajo
  "2025-06-02", // Ascensión (Pascua + 39 → lunes)
  "2025-06-23", // Corpus Christi (Pascua + 60 → lunes)
  "2025-06-30", // Sagrado Corazón y San Pedro y San Pablo, que en 2025 caen el mismo lunes
  "2025-07-20", // Independencia
  "2025-08-07", // Batalla de Boyacá
  "2025-08-18", // Asunción (15 de agosto → lunes 18)
  "2025-10-13", // Día de la Raza (12 de octubre → lunes 13)
  "2025-11-03", // Todos los Santos (1 de noviembre → lunes 3)
  "2025-11-17", // Independencia de Cartagena (11 de noviembre → lunes 17)
  "2025-12-08", // Inmaculada Concepción
  "2025-12-25", // Navidad
  // 2026 — Pascua el 5 de abril
  "2026-01-01", // Año Nuevo
  "2026-01-12", // Reyes (6 de enero → lunes 12)
  "2026-03-23", // San José (19 de marzo → lunes 23)
  "2026-04-02", // Jueves Santo
  "2026-04-03", // Viernes Santo
  "2026-05-01", // Día del Trabajo
  "2026-05-18", // Ascensión (Pascua + 39 → lunes)
  "2026-06-08", // Corpus Christi (Pascua + 60 → lunes)
  "2026-06-15", // Sagrado Corazón (Pascua + 68 → lunes)
  "2026-06-29", // San Pedro y San Pablo (29 de junio, ya es lunes)
  "2026-07-20", // Independencia
  "2026-08-07", // Batalla de Boyacá
  "2026-08-17", // Asunción (15 de agosto → lunes 17)
  "2026-10-12", // Día de la Raza (12 de octubre, ya es lunes)
  "2026-11-02", // Todos los Santos (1 de noviembre → lunes 2)
  "2026-11-16", // Independencia de Cartagena (11 de noviembre → lunes 16)
  "2026-12-08", // Inmaculada Concepción
  "2026-12-25", // Navidad
]);

/** Domingo = 0. En UTC a propósito: las fechas del libro son día, no instante. */
const diaSemana = (iso: string) => new Date(`${iso.slice(0, 10)}T00:00:00Z`).getUTCDay();

const hhmm = (h: number) => `${String(h).padStart(2, "0")}:00`;

const R42: Regla = ({ ix }) => {
  const inicio = ix.politicas.horarioInicio;
  const fin = ix.politicas.horarioFin;
  const conMarca = ix.libro.documentos.filter((d) => d.fechaRegistro && d.fechaRegistro.length > 10);
  if (!conMarca.length) return limpia(0);

  const horas = new Array<number>(24).fill(0);
  type Marca = { doc: Documento; hora: number; motivo: string };
  const raros: Marca[] = [];

  for (const doc of conMarca) {
    const marca = doc.fechaRegistro ?? "";
    const hora = Number(marca.slice(11, 13));
    if (!Number.isFinite(hora)) continue;
    horas[hora]++;

    const dia = diaSemana(marca);
    const motivos: string[] = [];
    if (hora < inicio || hora >= fin) motivos.push("fuera de la jornada");
    if (dia === 0) motivos.push("en domingo");
    else if (dia === 6) motivos.push("en sábado");
    if (FESTIVOS_CO.has(marca.slice(0, 10))) motivos.push("en festivo");
    if (motivos.length) raros.push({ doc, hora, motivo: motivos.join(" y ") });
  }

  const serie: Serie = { clase: "reloj", horas, laboral: [inicio, fin] };
  if (!raros.length) return limpia(conMarca.length);

  const madrugada = raros.filter((r) => r.hora >= 22 || r.hora < 5);
  const festivos = raros.filter((r) => FESTIVOS_CO.has((r.doc.fechaRegistro ?? "").slice(0, 10)));
  const finDeSemana = raros.filter((r) => {
    const d = diaSemana(r.doc.fechaRegistro ?? "");
    return d === 0 || d === 6;
  });
  const volumen = raros.reduce((s, r) => s + r.doc.montoTotal, 0);

  const porUsuario = porClave(agrupar(raros, (r) => r.doc.usuarioRegistro ?? "sin usuario"))
    .map(([usuario, lista]) => ({
      usuario,
      n: lista.length,
      monto: lista.reduce((s, r) => s + r.doc.montoTotal, 0),
    }))
    .sort((a, b) => b.n - a.n || a.usuario.localeCompare(b.usuario));
  const primero = porUsuario[0];
  const concentra = (primero.n / raros.length) * 100;

  const ordenados = [...raros].sort((a, b) => b.doc.montoTotal - a.doc.montoTotal || a.doc.id.localeCompare(b.doc.id));

  const hallazgos: HallazgoCrudo[] = [
    {
      titulo: `${numero(raros.length)} documentos registrados fuera de la jornada de ${hhmm(inicio)} a ${hhmm(fin)}, en fin de semana o en festivo`,
      resumen:
        `De ${numero(conMarca.length)} documentos con hora de registro, ${numero(raros.length)} se teclearon fuera del ` +
        `horario laboral que fija la política: ${numero(madrugada.length)} entre las 22:00 y las 05:00, ` +
        `${numero(finDeSemana.length)} en fin de semana y ${numero(festivos.length)} en festivo colombiano. ` +
        `${primero.usuario !== "sin usuario" ? `${numero(primero.n)} de ellos los registró el usuario ${primero.usuario} (${pctL(concentra)} del total). ` : ""}` +
        `El volumen movido en esos registros es de ${cop(volumen)}.`,
      montoEnRiesgo: Math.round(volumen),
      montoExacto: true,
      documentos: raros.map((r) => r.doc.id),
      evidencia: primeras(ordenados).map((r) =>
        evidenciaDocumento(
          ix,
          r.doc,
          `Registrado el ${fechaHora(r.doc.fechaRegistro ?? "")} · ${r.motivo}${r.doc.usuarioRegistro ? ` · ${r.doc.usuarioRegistro}` : ""}`,
        ),
      ),
      quePuedeEstarPasando: [
        "Cierres de mes y picos de temporada: en distribución se factura tarde el día que hay que despachar, y eso deja marcas de hora perfectamente normales.",
        "Trabajo remoto o desde otro huso: si alguien registra desde fuera, la hora del servidor no es la suya.",
        "Se registra fuera de horario porque a esa hora no hay nadie mirando lo que se está tecleando.",
        "Hay sesiones abiertas o credenciales compartidas y la marca de usuario no corresponde a quien de verdad hizo el registro.",
      ],
      queRevisar: [
        madrugada.length
          ? `Contrasta las ${numero(madrugada.length)} marcas entre las 22:00 y las 05:00 con el registro de acceso al ERP: si no hay sesión abierta a esa hora, la marca no es de una persona.`
          : "Contrasta las marcas fuera de jornada con el registro de acceso al ERP: si no hay sesión abierta, la marca no es de una persona.",
        festivos.length
          ? `Pregunta por los ${numero(festivos.length)} registros en festivo: son los que menos explicación operativa tienen.`
          : `Pregunta por los ${numero(finDeSemana.length)} registros en fin de semana: son los que menos explicación operativa tienen.`,
        primero.usuario !== "sin usuario"
          ? `Revisa si el patrón de ${primero.usuario} coincide con sus turnos y con el tipo de documento que registra.`
          : "Revisa si los registros sin usuario corresponden a procesos automáticos o a sesiones genéricas.",
      ],
      controlSugerido:
        "Aviso automático al responsable del área por cada documento registrado fuera de la jornada, y cierre de sesión del ERP fuera del horario salvo excepción nominal.",
      sujeto: primero.usuario !== "sin usuario" ? sujetoUsuario(primero.usuario) : null,
      serie,
      repeticiones: raros.length,
      evidenciaCompleta: true,
    },
  ];

  // Si además hay un TERCERO cuyos documentos se registraron casi siempre fuera
  // de horario, sale aparte: cambia el sujeto de la persona al proveedor y
  // permite que el hallazgo se agrupe con lo que las capas 1 y 2 dijeron de él.
  const tasaGlobal = raros.length / conMarca.length;
  const docsPorTercero = agrupar(
    conMarca.filter((d) => d.terceroId && d.tipo === "factura_compra"),
    (d) => d.terceroId ?? "",
  );
  const rarosPorTercero = agrupar(
    raros.filter((r) => r.doc.terceroId && r.doc.tipo === "factura_compra"),
    (r) => r.doc.terceroId ?? "",
  );
  const sospechosos = porClave(rarosPorTercero)
    .map(([id, lista]) => ({
      id,
      lista,
      total: (docsPorTercero.get(id) ?? []).length,
      proporcion: lista.length / Math.max(1, (docsPorTercero.get(id) ?? []).length),
    }))
    .filter((s) => s.lista.length >= 3 && s.proporcion >= 0.4 && s.proporcion >= tasaGlobal * 4)
    .sort((a, b) => b.lista.length - a.lista.length || a.id.localeCompare(b.id));

  if (sospechosos.length) {
    const s = sospechosos[0];
    const tercero = ix.tercero.get(s.id);
    const volumenT = s.lista.reduce((acc, r) => acc + r.doc.montoTotal, 0);
    const horasT = new Array<number>(24).fill(0);
    for (const d of docsPorTercero.get(s.id) ?? []) {
      const h = Number((d.fechaRegistro ?? "").slice(11, 13));
      if (Number.isFinite(h)) horasT[h]++;
    }
    const serieT: Serie = {
      clase: "reloj",
      horas: horasT,
      laboral: [inicio, fin],
    };
    hallazgos.push({
      titulo: `${numero(s.lista.length)} de las ${numero(s.total)} facturas de ${ix.nombre(s.id)} se registraron fuera de horario`,
      resumen:
        `${ix.nombre(s.id)} tiene ${numero(s.total)} facturas de compra con hora de registro en el período y ` +
        `${numero(s.lista.length)} de ellas —el ${pctL(s.proporcion * 100)}— se teclearon fuera de la jornada, en fin de ` +
        `semana o en festivo, cuando en el conjunto del libro solo pasa con el ${pctL(tasaGlobal * 100)} de los documentos. ` +
        `Mueven ${cop(volumenT)}. Es el tercero con más documentos fuera de horario de todos los que pasan de la mitad.`,
      montoEnRiesgo: Math.round(volumenT),
      montoExacto: true,
      documentos: s.lista.map((r) => r.doc.id),
      evidencia: primeras(
        [...s.lista].sort((a, b) => a.doc.fecha.localeCompare(b.doc.fecha) || a.doc.id.localeCompare(b.doc.id)),
      ).map((r) =>
        evidenciaDocumento(
          ix,
          r.doc,
          `Registrado el ${fechaHora(r.doc.fechaRegistro ?? "")} · ${r.motivo}${r.doc.usuarioRegistro ? ` · ${r.doc.usuarioRegistro}` : ""}`,
        ),
      ),
      quePuedeEstarPasando: [
        "Es un proveedor de urgencias al que se le compra cuando falta algo, y las urgencias no pasan en horario de oficina.",
        "Sus documentos entran por lote al final del día o del mes y todos comparten la marca del proceso, no la del hecho.",
        "Los documentos de este tercero se registran a una hora en la que nadie más está trabajando en el mismo módulo.",
        "El registro se está haciendo fuera del flujo normal de compras, y la hora es la huella de que no pasó por donde debía.",
      ],
      queRevisar: [
        `Revisa el expediente completo de ${ix.nombre(s.id)}: quién lo creó, quién autoriza sus compras y quién las recibe.`,
        "Compara la hora de registro con la fecha del documento: si el documento es de un día y la marca de otro, hubo registro diferido.",
        "Mira si este tercero aparece también en las reglas de capa 1 y 2: dos indicios por caminos distintos no son dos indicios.",
      ],
      controlSugerido:
        "Segregación de funciones sobre este proveedor —quien lo crea no registra sus facturas— y revisión manual de todo documento suyo registrado fuera de la jornada.",
      sujeto: tercero ? sujetoTercero(tercero) : null,
      serie: serieT,
      repeticiones: s.lista.length,
      evidenciaCompleta: true,
    });
  }

  return conHallazgos(conMarca.length, hallazgos);
};

/* ══════════════════════════════════════════════════════════════════════
   R43 · Importes atípicos frente al histórico del propio tercero
   ══════════════════════════════════════════════════════════════════════ */

const R43: Regla = ({ ix }) => {
  const docs = comprasVigentes(ix);
  const porTercero = agrupar(
    docs.filter((d) => d.terceroId),
    (d) => d.terceroId ?? "",
  );

  type Atipico = {
    doc: Documento;
    z: number;
    media: number;
    terceroId: string;
  };
  const atipicos: Atipico[] = [];

  for (const [terceroId, lista] of porClave(porTercero)) {
    // El histórico es el del propio tercero: 40 millones es normal para el
    // proveedor de aceite y es enorme para el de papelería. Medir a todos
    // contra la misma media sería medir el tamaño del proveedor, no la anomalía.
    if (lista.length < R43_MINIMO_HISTORICO) continue;
    const media = lista.reduce((s, d) => s + d.montoTotal, 0) / lista.length;
    const varianza = lista.reduce((s, d) => s + (d.montoTotal - media) ** 2, 0) / (lista.length - 1);
    const desviacion = Math.sqrt(varianza);
    if (desviacion <= 0) continue;
    for (const doc of lista) {
      const z = (doc.montoTotal - media) / desviacion;
      if (z >= R43_Z) atipicos.push({ doc, z, media, terceroId });
    }
  }
  if (!atipicos.length) return limpia(docs.length);

  atipicos.sort((a, b) => b.z - a.z || a.doc.id.localeCompare(b.doc.id));
  const volumen = atipicos.reduce((s, a) => s + a.doc.montoTotal, 0);
  const ranking = porClave(agrupar(atipicos, (a) => a.terceroId))
    .map(([id, lista]) => ({ id, n: lista.length }))
    .sort((a, b) => b.n - a.n || a.id.localeCompare(b.id));
  const dominante = ranking[0].n >= 2 ? ix.tercero.get(ranking[0].id) : undefined;

  const serie: Serie = {
    clase: "barras",
    puntos: primeras(atipicos).map((a) => ({
      etiqueta: a.doc.numero,
      valor: Math.round(a.doc.montoTotal),
      marcado: true,
    })),
    unidad: "dinero",
  };

  return conHallazgos(docs.length, [
    {
      titulo: `${numero(atipicos.length)} facturas de compra se salen del histórico de su propio proveedor (z ≥ ${R43_Z}): ${cop(volumen)}`,
      resumen:
        `Comparando cada factura con la media y la desviación de las compras de su mismo proveedor, ${numero(atipicos.length)} ` +
        `documentos quedan a ${R43_Z} desviaciones típicas o más. El más extremo es la ${atipicos[0].doc.numero} de ` +
        `${ix.nombre(atipicos[0].terceroId)}, de ${cop(atipicos[0].doc.montoTotal)} frente a una media de ` +
        `${cop(atipicos[0].media)} (z ${decimal(atipicos[0].z)}). Entre todos mueven ${cop(volumen)}.`,
      montoEnRiesgo: Math.round(volumen),
      montoExacto: true,
      documentos: atipicos.map((a) => a.doc.id),
      evidencia: primeras(atipicos).map((a) =>
        evidenciaDocumento(
          ix,
          a.doc,
          `z ${decimal(a.z)} · media del proveedor ${cop(a.media)} · este documento ${cop(a.doc.montoTotal)}`,
        ),
      ),
      quePuedeEstarPasando: [
        "Son pedidos grandes de temporada o compras anuales concentradas: el proveedor es el de siempre y el importe se sale porque el pedido era el del año.",
        "Varias entregas se facturaron juntas en un solo documento y el importe acumula lo que normalmente van en cuatro.",
        "El importe se tecleó con un dígito de más y nadie lo vio porque pasó el flujo sin comparación con el histórico.",
        "El documento no corresponde al suministro habitual de ese proveedor y se le facturó algo distinto de lo que suele vender.",
      ],
      queRevisar: [
        `Empieza por la ${atipicos[0].doc.numero}: pide la orden de compra, la entrada de inventario y el detalle de líneas.`,
        "Comprueba si el importe grande sustituye a varias facturas que ese mes no aparecieron.",
        "Mira si estos documentos tienen el mismo autorizador que los normales del proveedor.",
      ],
      controlSugerido:
        "Alerta en el momento de registrar cuando el importe se salga tres desviaciones del histórico del proveedor, con confirmación explícita para continuar.",
      sujeto: dominante ? sujetoTercero(dominante) : null,
      serie,
      repeticiones: atipicos.length,
      evidenciaCompleta: true,
    },
  ]);
};

/* ══════════════════════════════════════════════════════════════════════
   R44 · Cambio brusco de peso de un proveedor
   ══════════════════════════════════════════════════════════════════════ */

const R44: Regla = ({ ix }) => {
  const docs = comprasVigentes(ix).filter((d) => d.terceroId);
  if (!docs.length) return limpia(0);

  const trimestres = [...new Set(docs.map((d) => trimestreDe(d.fecha)))].sort();
  const gastoTrimestre = new Map<string, number>();
  const gastoProveedor = new Map<string, number>();
  const docsProveedor = agrupar(docs, (d) => d.terceroId ?? "");

  for (const d of docs) {
    const t = trimestreDe(d.fecha);
    gastoTrimestre.set(t, (gastoTrimestre.get(t) ?? 0) + d.montoTotal);
    const k = `${d.terceroId} ${t}`;
    gastoProveedor.set(k, (gastoProveedor.get(k) ?? 0) + d.montoTotal);
  }

  const candidatos: {
    esNuevo: boolean;
    salto: number;
    crudo: HallazgoCrudo;
  }[] = [];
  for (const [terceroId, suyos] of porClave(docsProveedor)) {
    const tercero = ix.tercero.get(terceroId);
    const alta = tercero?.fechaCreacion ?? "";
    const altaDentro = alta !== "" && alta >= ix.libro.periodo.desde;
    const gastoPeriodo = suyos.reduce((acc, d) => acc + d.montoTotal, 0);
    let salto = 0;
    let trimestreSalto = "";
    let anterior = "";
    let partidaAntes = 0;
    let partidaDespues = 0;
    let esNuevo = false;

    for (let i = 1; i < trimestres.length; i++) {
      const tAnt = trimestres[i - 1];
      const tAct = trimestres[i];
      const totalAnt = gastoTrimestre.get(tAnt) ?? 0;
      const totalAct = gastoTrimestre.get(tAct) ?? 0;
      if (totalAnt <= 0 || totalAct <= 0) continue;

      const gastoAnt = gastoProveedor.get(`${terceroId} ${tAnt}`) ?? 0;
      const gastoAct = gastoProveedor.get(`${terceroId} ${tAct}`) ?? 0;
      const pctAnt = (gastoAnt / totalAnt) * 100;
      const pctAct = (gastoAct / totalAct) * 100;
      const delta = pctAct - pctAnt;

      const nuevo =
        gastoAnt === 0 &&
        gastoAct > 0 &&
        altaDentro &&
        gastoPeriodo >= R44_NUEVO_MONTO &&
        suyos.length >= R44_NUEVO_FACTURAS;

      // Ganar peso de golpe es lo que interesa. Perderlo poco a poco es la vida
      // normal de una cartera de proveedores y llenaría la pantalla de ruido; la
      // única pérdida que se reporta es la desaparición completa de uno que sí
      // pesaba, porque un proveedor que deja de existir merece una pregunta.
      const gana = delta > R44_PUNTOS;
      const desaparece = gastoAct === 0 && pctAnt > R44_PUNTOS && !suyos.some((d) => trimestreDe(d.fecha) >= tAct);

      if (gana || desaparece || nuevo) {
        if (Math.abs(delta) > Math.abs(salto)) {
          salto = delta;
          trimestreSalto = tAct;
          anterior = tAnt;
          partidaAntes = pctAnt;
          partidaDespues = pctAct;
          esNuevo = nuevo;
        }
      }
    }
    if (!trimestreSalto) continue;

    const ordenados = [...suyos].sort((a, b) => a.fecha.localeCompare(b.fecha) || a.id.localeCompare(b.id));
    const volumen = ordenados.reduce((s, d) => s + d.montoTotal, 0);

    const serie: Serie = {
      clase: "barras",
      puntos: trimestres.map((t) => ({
        etiqueta: t,
        valor: Math.round(gastoProveedor.get(`${terceroId} ${t}`) ?? 0),
        marcado: t === trimestreSalto,
      })),
      unidad: "dinero",
    };

    candidatos.push({
      esNuevo,
      salto,
      crudo: {
        titulo: esNuevo
          ? `${ix.nombre(terceroId)} se dio de alta el ${fechaLarga(alta, true)} y ya pesa el ${pctL(partidaDespues)} del gasto de compras: ${cop(volumen)} en el período`
          : `${ix.nombre(terceroId)} ${salto > 0 ? "pasó" : "cayó"} del ${pctL(partidaAntes)} al ${pctL(partidaDespues)} del gasto de compras en un trimestre`,
        resumen:
          `Entre ${anterior} y ${trimestreSalto}, la participación de ${ix.nombre(terceroId)} en el gasto total de compras ` +
          `${salto > 0 ? "subió" : "bajó"} ${decimal(Math.abs(salto))} puntos, del ${pctL(partidaAntes)} al ${pctL(partidaDespues)}. ` +
          `${
            esNuevo
              ? `Su ficha se creó el ${fecha(alta)}, dentro del período auditado, y no tenía ninguna compra en el trimestre anterior. `
              : ""
          }En todo el período acumula ${numero(ordenados.length)} facturas por ${cop(volumen)}.`,
        montoEnRiesgo: Math.round(volumen),
        montoExacto: true,
        documentos: ordenados.map((d) => d.id),
        evidencia: primeras(ordenados).map((d) =>
          evidenciaDocumento(
            ix,
            d,
            `${trimestreDe(d.fecha)} · ${cop(d.montoTotal)}${d.usuarioRegistro ? ` · registró ${d.usuarioRegistro}` : ""}`,
          ),
        ),
        quePuedeEstarPasando: [
          "Se ganó una licitación o se abrió una línea nueva y el proveedor entró con volumen desde el primer día; es lo normal cuando cambia el catálogo.",
          "Un proveedor histórico falló o subió precios y hubo que sustituirlo deprisa por otro.",
          "La decisión de traer a este proveedor se tomó fuera del comité de compras y por eso no hay rastro de la comparación previa.",
          "El volumen se está dirigiendo a un proveedor concreto y la velocidad del cambio es lo que lo hace visible.",
        ],
        queRevisar: [
          `Pide el expediente de alta de ${ix.nombre(terceroId)}: cotizaciones, referencias comerciales y quién lo aprobó.`,
          `Mira qué proveedor perdió el volumen que ganó éste en ${trimestreSalto}.`,
          "Comprueba si sus facturas llevan orden de compra y entrada de inventario, o si entraron por la puerta de atrás.",
        ],
        controlSugerido:
          "Informe trimestral de participación por proveedor, con revisión obligatoria de todo el que gane más de cuatro puntos o entre desde cero.",
        sujeto: tercero ? sujetoTercero(tercero) : null,
        serie,
        repeticiones: ordenados.length,
        evidenciaCompleta: true,
      },
    });
  }

  candidatos.sort((a, b) => Number(b.esNuevo) - Number(a.esNuevo) || Math.abs(b.salto) - Math.abs(a.salto));
  return conHallazgos(
    docs.length,
    candidatos.slice(0, R44_MAXIMOS).map((c) => c.crudo),
  );
};

/* ══════════════════════════════════════════════════════════════════════
   R45 · Concentración de volumen en un usuario
   ══════════════════════════════════════════════════════════════════════ */

/**
 * Solo documentos de control, y esto es una decisión, no un olvido: que un
 * vendedor concentre el 60 % de las facturas de venta no es un hallazgo, es un
 * buen vendedor. Que una sola persona emita el 60 % de las notas crédito, de
 * los recibos de caja o de los pagos, sí lo es: son los documentos que anulan,
 * cobran o sacan dinero.
 */
const FAMILIAS_R45: TipoDocumento[] = ["nota_credito", "nota_debito", "recibo_caja", "pago"];

const R45: Regla = ({ ix }) => {
  const hallazgos: HallazgoCrudo[] = [];
  let revisados = 0;

  for (const tipo of FAMILIAS_R45) {
    const docs = ix.porTipo(tipo).filter((d) => d.estado !== "anulado" && d.usuarioRegistro);
    revisados += docs.length;
    const porUsuario = agrupar(docs, (d) => d.usuarioRegistro ?? "");
    if (porUsuario.size < R45_MINIMO_USUARIOS || !docs.length) continue;

    const total = docs.reduce((s, d) => s + d.montoTotal, 0);
    if (total <= 0) continue;

    const ranking = porClave(porUsuario)
      .map(([usuario, lista]) => ({
        usuario,
        lista,
        monto: lista.reduce((s, d) => s + d.montoTotal, 0),
        pctMonto: (lista.reduce((s, d) => s + d.montoTotal, 0) / total) * 100,
        pctConteo: (lista.length / docs.length) * 100,
      }))
      .sort((a, b) => b.monto - a.monto || a.usuario.localeCompare(b.usuario));

    const primero = ranking[0];
    // Por volumen o por número de documentos: quien emite muchas notas
    // pequeñas concentra igual de mal que quien emite una grande.
    const pico = Math.max(primero.pctMonto, primero.pctConteo);
    if (pico <= R45_CONCENTRACION_PCT) continue;

    const etiqueta =
      tipo === "nota_credito"
        ? "notas crédito"
        : tipo === "nota_debito"
          ? "notas débito"
          : tipo === "recibo_caja"
            ? "recibos de caja"
            : "pagos a proveedor";
    const conArticulo = tipo === "recibo_caja" || tipo === "pago" ? `los ${etiqueta}` : `las ${etiqueta}`;
    const reparto = pctL(100 / porUsuario.size);

    const serie: Serie = {
      clase: "barras",
      puntos: ranking.map((r) => ({
        etiqueta: r.usuario,
        valor: Math.round(r.monto),
        marcado: r.usuario === primero.usuario,
      })),
      unidad: "dinero",
    };

    const ordenados = [...primero.lista].sort((a, b) => b.montoTotal - a.montoTotal || a.id.localeCompare(b.id));

    hallazgos.push({
      titulo: `El usuario ${primero.usuario} concentra el ${pctL(primero.pctMonto)} de ${conArticulo} del período: ${cop(primero.monto)}`,
      resumen:
        `${numero(docs.length)} ${etiqueta} del período las emitieron ${numero(porUsuario.size)} usuarios distintos, por ` +
        `${cop(total)}. ${primero.usuario} firma ${numero(primero.lista.length)} de ellas —el ${pctL(primero.pctConteo)} de ` +
        `los documentos y el ${pctL(primero.pctMonto)} del dinero, ${cop(primero.monto)}— cuando un reparto parejo entre los ` +
        `${numero(porUsuario.size)} daría un ${reparto} a cada uno.`,
      montoEnRiesgo: Math.round(primero.monto),
      montoExacto: true,
      documentos: primero.lista.map((d) => d.id),
      evidencia: primeras(ordenados).map((d) =>
        evidenciaDocumento(
          ix,
          d,
          `Emitida por ${primero.usuario}${d.facturaAfectadaId ? ` · afecta a ${ix.documento.get(d.facturaAfectadaId)?.numero ?? d.facturaAfectadaId}` : ""}`,
        ),
      ),
      quePuedeEstarPasando: [
        `Es su función: si ${conArticulo} son responsabilidad de una sola persona en el organigrama, la concentración es el diseño del puesto y no un hallazgo.`,
        "Los demás usuarios registran poco porque el proceso está centralizado por comodidad, no por decisión de control.",
        "No hay segregación de funciones: quien detecta el problema, lo documenta y lo aprueba es la misma persona.",
        `Se están usando ${conArticulo} como salida discrecional, y estar solo en el proceso es lo que lo hace posible.`,
      ],
      queRevisar: [
        `Pide el soporte y la autorización de las ${numero(primero.lista.length)} ${etiqueta} de ${primero.usuario}: quién las pidió y quién las aprobó, además de quién las tecleó.`,
        "Comprueba si los terceros afectados se repiten entre esos documentos.",
        "Mira si la concentración existía antes del período o si empezó en algún mes concreto.",
      ],
      controlSugerido: `Aprobación de un segundo usuario para ${etiqueta} por encima de un importe, e informe mensual de reparto por usuario.`,
      sujeto: sujetoUsuario(primero.usuario),
      serie,
      repeticiones: primero.lista.length,
      evidenciaCompleta: true,
    });
  }

  hallazgos.sort((a, b) => b.montoEnRiesgo - a.montoEnRiesgo);
  return conHallazgos(revisados, hallazgos);
};

/* ─────────────────────────────────────────────────────────────────────── */

export const CAPA3: Record<string, Regla> = { R40, R41, R42, R43, R44, R45 };
