/**
 * Escribe los seis Excel de Distribuidora Andina y comprueba que dicen lo que
 * el guion va a decir en voz alta.
 *
 * Los ficheros salen a dos sitios: `Excel Distribuidora Andina/` en la raíz, que
 * es la carpeta que Luis arrastra en cámara, y `public/datos/`, que alimenta el
 * atajo de emergencia si el arrastre falla en directo.
 *
 * Lo que de verdad importa de este script no es escribir: es la batería de
 * invariantes del final. Un dataset que no cuadre no se nota al generarlo, se
 * nota en mitad de la grabación, cuando el motor devuelve un número distinto al
 * que acaba de leerse en el guion. Por eso cada caso sembrado se comprueba uno
 * a uno y con su cifra, y por eso el script sale con código 1 si algo baila.
 *
 *   node --import ./scripts/resolver-ts.mjs scripts/lupa-generar.ts
 */

import { createHash } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import XLSX from "xlsx";
import {
  ARCHIVOS,
  CASOS,
  ENCABEZADOS,
  EMPRESA,
  HOJAS,
  NIT_EMPRESA,
  PERIODO,
  POLITICAS,
  construirDataset,
  digitoVerificacion,
  saldosDelExtracto,
} from "../lib/lupa/dataset";
import { cop, copCorto, fecha as fmtFecha, fechaHora, numero as fmtNum } from "../lib/lupa/moneda";
import type { Documento, LineaDocumento, Libro, TipoDocumento } from "../lib/lupa/tipos";

const RAIZ = process.cwd();
const DESTINOS = [join(RAIZ, "public", "datos"), join(RAIZ, "Excel Distribuidora Andina")];

/* ─────────────────────────────  Escritura  ───────────────────────────── */

type Fila = (string | number)[];

const TIPO_DOC_EXCEL: Record<TipoDocumento, string> = {
  orden_compra: "OC",
  factura_compra: "FC",
  entrada_inventario: "ENT",
  factura_venta: "FV",
  nota_credito: "NC",
  nota_debito: "ND",
  pago: "PAGO",
  recibo_caja: "RC",
};

const CAMPO_EXCEL: Record<string, string> = {
  cuenta_bancaria: "CUENTA BANCARIA",
  telefono: "TELEFONO",
  direccion: "DIRECCION",
  nombre: "NOMBRE",
};

function hoja(encabezados: readonly string[], filas: Fila[], anchos: number[]) {
  const ws = XLSX.utils.aoa_to_sheet([[...encabezados], ...filas]);
  ws["!cols"] = anchos.map((wch) => ({ wch }));
  return ws;
}

function libroExcel(hojas: { nombre: string; ws: XLSX.WorkSheet }[]) {
  const wb = XLSX.utils.book_new();
  for (const h of hojas) XLSX.utils.book_append_sheet(wb, h.ws, h.nombre);
  return XLSX.write(wb, { bookType: "xlsx", type: "buffer" }) as Buffer;
}

function escribir(nombre: string, buf: Buffer) {
  for (const destino of DESTINOS) writeFileSync(join(destino, nombre), buf);
}

function filasDetalle(lineas: LineaDocumento[]): Fila[] {
  return lineas.map((l) => [
    l.documentoId,
    l.sku,
    l.descripcion,
    l.cantidad,
    l.precioUnitario,
    l.costoUnitario ?? "",
    l.descuentoPct,
    l.total,
  ]);
}

function generar(libro: Libro): Record<string, number> {
  for (const d of DESTINOS) mkdirSync(d, { recursive: true });
  const nombreTercero = new Map(libro.terceros.map((t) => [t.id, t.nombre]));
  const deArchivo = <T extends { origen: { archivo: string; hoja: string } }>(xs: T[], archivo: string, hj: string) =>
    xs.filter((x) => x.origen.archivo === archivo && x.origen.hoja === hj);

  /* 01 Terceros */
  escribir(
    ARCHIVOS.terceros,
    libroExcel([
      {
        nombre: HOJAS.terceros,
        ws: hoja(
          ENCABEZADOS.terceros,
          libro.terceros.map((t) => [
            t.id,
            t.nombre,
            t.tipo.toUpperCase(),
            t.nit,
            t.telefono,
            t.direccion,
            t.cuentaBancaria,
            t.banco,
            fmtFecha(t.fechaCreacion),
            t.usuarioCreacion ?? "",
          ]),
          [13, 40, 11, 16, 16, 46, 14, 22, 12, 12],
        ),
      },
      {
        nombre: HOJAS.cambios,
        ws: hoja(
          ENCABEZADOS.cambios,
          libro.cambiosTercero.map((c) => [
            c.terceroId,
            CAMPO_EXCEL[c.campo],
            c.valorAnterior,
            c.valorNuevo,
            fmtFecha(c.fecha),
            c.usuario ?? "",
          ]),
          [13, 18, 46, 46, 13, 12],
        ),
      },
    ]),
  );

  /* 02 Compras */
  const docsCompra = deArchivo(libro.documentos, ARCHIVOS.compras, HOJAS.documentos);
  const lineasCompra = deArchivo(libro.lineas, ARCHIVOS.compras, HOJAS.detalle);
  escribir(
    ARCHIVOS.compras,
    libroExcel([
      {
        nombre: HOJAS.documentos,
        ws: hoja(
          ENCABEZADOS.comprasDocumentos,
          docsCompra.map((d) => [
            TIPO_DOC_EXCEL[d.tipo],
            d.numero,
            d.consecutivo ?? "",
            d.terceroId ?? "",
            nombreTercero.get(d.terceroId ?? "") ?? "",
            fmtFecha(d.fecha),
            d.fechaRegistro ? fechaHora(d.fechaRegistro) : "",
            d.usuarioRegistro ?? "",
            d.montoTotal,
            d.estado.toUpperCase(),
            d.ordenCompraId ?? "",
            d.entradaInventarioId ?? "",
          ]),
          [9, 16, 8, 13, 40, 12, 17, 11, 15, 10, 16, 16],
        ),
      },
      { nombre: HOJAS.detalle, ws: hoja(ENCABEZADOS.detalle, filasDetalle(lineasCompra), [16, 13, 40, 8, 13, 13, 8, 15]) },
    ]),
  );

  /* 03 Ventas */
  const docsVenta = deArchivo(libro.documentos, ARCHIVOS.ventas, HOJAS.documentos);
  const lineasVenta = deArchivo(libro.lineas, ARCHIVOS.ventas, HOJAS.detalle);
  escribir(
    ARCHIVOS.ventas,
    libroExcel([
      {
        nombre: HOJAS.documentos,
        ws: hoja(
          ENCABEZADOS.ventasDocumentos,
          docsVenta.map((d) => [
            TIPO_DOC_EXCEL[d.tipo],
            d.numero,
            d.consecutivo ?? "",
            d.terceroId ?? "",
            nombreTercero.get(d.terceroId ?? "") ?? "",
            fmtFecha(d.fecha),
            d.fechaRegistro ? fechaHora(d.fechaRegistro) : "",
            d.usuarioRegistro ?? "",
            d.montoTotal,
            d.estado.toUpperCase(),
            d.facturaAfectadaId ?? "",
            d.diasCredito ?? "",
          ]),
          [9, 16, 8, 13, 40, 12, 17, 11, 15, 10, 16, 13],
        ),
      },
      { nombre: HOJAS.detalle, ws: hoja(ENCABEZADOS.detalle, filasDetalle(lineasVenta), [16, 13, 40, 8, 13, 13, 8, 15]) },
    ]),
  );

  /* 04 Inventario */
  escribir(
    ARCHIVOS.inventario,
    libroExcel([
      {
        nombre: HOJAS.movimientos,
        ws: hoja(
          ENCABEZADOS.movimientos,
          libro.inventario.map((m) => [
            m.id,
            m.sku,
            m.bodega,
            m.tipo.toUpperCase(),
            m.cantidad,
            fmtFecha(m.fecha),
            m.documentoId ?? "",
            m.usuario ?? "",
            m.motivo ?? "",
          ]),
          [14, 13, 17, 11, 10, 12, 16, 12, 30],
        ),
      },
      {
        nombre: HOJAS.productos,
        ws: hoja(
          ENCABEZADOS.productos,
          libro.items.map((i) => [i.sku, i.nombre, i.categoria, i.costoPromedio, i.stockActual, i.inventariable ? "SI" : "NO"]),
          [13, 40, 22, 13, 12, 18],
        ),
      },
    ]),
  );

  /* 05 Banco */
  const saldos = saldosDelExtracto(libro.banco);
  escribir(
    ARCHIVOS.banco,
    libroExcel([
      {
        nombre: HOJAS.extracto,
        ws: hoja(
          ENCABEZADOS.extracto,
          libro.banco.map((b, i) => [
            fmtFecha(b.fecha),
            b.descripcion,
            b.tipo === "debito" ? b.monto : "",
            b.tipo === "credito" ? b.monto : "",
            saldos[i],
            b.cuenta,
            b.documentoConciliadoId ?? "",
          ]),
          [12, 40, 15, 15, 16, 14, 16],
        ),
      },
    ]),
  );

  /* 06 Políticas */
  const p = libro.politicas!;
  escribir(
    ARCHIVOS.politicas,
    libroExcel([
      {
        nombre: HOJAS.parametros,
        ws: hoja(
          ENCABEZADOS.parametros,
          [
            ["Umbral de aprobación de compra", p.umbralAprobacion],
            ["Margen mínimo (%)", p.margenMinimoPct],
            ["Descuento máximo (%)", p.descuentoMaximoPct],
            ["Días de crédito", p.diasCredito],
            ["Hora de inicio de jornada", p.horarioInicio],
            ["Hora de fin de jornada", p.horarioFin],
            ["Monto mínimo que exige soporte de pago", p.minimoSoportePago],
          ],
          [42, 16],
        ),
      },
    ]),
  );

  return {
    terceros: libro.terceros.length,
    cambios: libro.cambiosTercero.length,
    documentos: libro.documentos.length,
    lineas: libro.lineas.length,
    inventario: libro.inventario.length,
    banco: libro.banco.length,
    items: libro.items.length,
  };
}

/* ─────────────────────────────  Invariantes  ───────────────────────────── */

const fallos: string[] = [];
let comprobadas = 0;

function exige(caso: string, condicion: boolean, detalle: string) {
  comprobadas++;
  if (!condicion) fallos.push(`${caso}  ${detalle}`);
}
function exigeRango(caso: string, valor: number, lo: number, hi: number, que: string) {
  exige(caso, valor >= lo && valor <= hi, `${que}: ${fmtNum(valor)} fuera de [${fmtNum(lo)}, ${fmtNum(hi)}]`);
}

const suma = (xs: number[]) => xs.reduce((a, b) => a + b, 0);
function lista<K, V>(m: Map<K, V[]>, k: K): V[] {
  const previo = m.get(k);
  if (previo) return previo;
  const nuevo: V[] = [];
  m.set(k, nuevo);
  return nuevo;
}
const hora = (iso: string | null) => (iso && iso.length > 10 ? Number(iso.slice(11, 13)) : 12);
const dias = (a: string, b: string) => Math.round((Date.parse(b.slice(0, 10)) - Date.parse(a.slice(0, 10))) / 86_400_000);

function verificar(libro: Libro, casos: ReturnType<typeof construirDataset>["casos"]) {
  const doc = new Map(libro.documentos.map((d) => [d.numero, d]));
  const tercero = new Map(libro.terceros.map((t) => [t.id, t]));
  const item = new Map(libro.items.map((i) => [i.sku, i]));
  const lineasDe = new Map<string, LineaDocumento[]>();
  for (const l of libro.lineas) lista(lineasDe, l.documentoId).push(l);
  const porTipo = (t: TipoDocumento) => libro.documentos.filter((d) => d.tipo === t);

  const fvs = porTipo("factura_venta");
  const fcs = porTipo("factura_compra");
  const ocs = porTipo("orden_compra");
  const pagos = porTipo("pago");
  const ncs = porTipo("nota_credito");
  const rcs = porTipo("recibo_caja");
  const facturacion = suma(fvs.filter((d) => d.estado !== "anulado").map((d) => d.montoTotal));
  const compras = suma(fcs.filter((d) => d.estado !== "anulado").map((d) => d.montoTotal));

  /* ── Volumen y cuadre general ── */
  exigeRango("VOL", libro.documentos.length, 3_900, 4_200, "documentos");
  exigeRango("VOL", facturacion, 4_150_000_000, 4_250_000_000, "facturación");
  exigeRango("VOL", compras, 2_850_000_000, 2_950_000_000, "compras");

  let descuadres = 0;
  for (const [id, ls] of lineasDe) {
    const d = doc.get(id);
    if (!d) continue;
    if (Math.abs(d.montoTotal - suma(ls.map((l) => l.total))) > 1) descuadres++;
  }
  exige("CUADRE", descuadres === 0, `${descuadres} documentos cuyo total no es la suma de sus líneas`);

  let rotas = 0;
  const referencia = (id: string | null) => id === null || doc.has(id);
  for (const d of libro.documentos) {
    if (!referencia(d.ordenCompraId) || !referencia(d.entradaInventarioId) || !referencia(d.facturaAfectadaId)) rotas++;
    if (d.terceroId !== null && !tercero.has(d.terceroId)) rotas++;
  }
  for (const b of libro.banco) if (!referencia(b.documentoConciliadoId)) rotas++;
  for (const m of libro.inventario) if (!referencia(m.documentoId)) rotas++;
  for (const l of libro.lineas) if (!item.has(l.sku)) rotas++;
  for (const c of libro.cambiosTercero) if (!tercero.has(c.terceroId)) rotas++;
  exige("REFS", rotas === 0, `${rotas} referencias rotas`);

  /* ── S1 · proveedor fantasma ── */
  const prv47 = tercero.get(CASOS.proveedorFantasma)!;
  const emp4 = tercero.get(CASOS.empleadaCompras)!;
  const fcs47 = fcs.filter((d) => d.terceroId === CASOS.proveedorFantasma).sort((a, b) => (a.fecha < b.fecha ? -1 : 1));
  exige("S1", prv47.fechaCreacion === "2025-11-06", `creación de ${prv47.id} = ${prv47.fechaCreacion}`);
  exige("S1", prv47.cuentaBancaria === emp4.cuentaBancaria, "la cuenta del proveedor no coincide con la de la empleada");
  exige("S1", fcs47.length === 7, `${fcs47.length} facturas del proveedor exprés`);
  exige("S1", fcs47[0]?.fecha === "2025-11-07", `primera factura ${fcs47[0]?.fecha}`);
  exige("S1", suma(fcs47.map((d) => d.montoTotal)) === 19_400_000, `suman ${cop(suma(fcs47.map((d) => d.montoTotal)))}`);
  exige("S1", fcs47.every((d) => d.ordenCompraId === null), "alguna trae orden de compra");
  exige("S1", fcs47.every((d) => d.usuarioRegistro === "mosorio"), "alguna no la registró mosorio");
  exige("S1", fcs47.filter((d) => hora(d.fechaRegistro) >= 22 || hora(d.fechaRegistro) < 5).length === 4, "no son cuatro las nocturnas");
  const compartidas = new Map<string, string[]>();
  for (const t of libro.terceros) lista(compartidas, t.cuentaBancaria).push(t.id);
  exige("S1", [...compartidas.values()].filter((v) => v.length > 1).length === 1, "hay más de una cuenta bancaria compartida");

  /* ── S2 · pago duplicado ── */
  const fcDup = doc.get(CASOS.facturaDuplicada);
  const pagosDup = pagos.filter((p) => p.facturaAfectadaId === CASOS.facturaDuplicada);
  exige("S2", !!fcDup && fcDup.montoTotal === 3_200_000, `${CASOS.facturaDuplicada} = ${fcDup ? cop(fcDup.montoTotal) : "no existe"}`);
  exige("S2", fcDup?.terceroId === CASOS.pagoDuplicado, `la factura no es de ${CASOS.pagoDuplicado}`);
  exige("S2", pagosDup.length === 2, `${pagosDup.length} pagos sobre la misma factura`);
  exige("S2", pagosDup[0]?.fecha === "2026-02-09" && pagosDup[1]?.fecha === "2026-02-20", `fechas ${pagosDup.map((p) => p.fecha).join(" y ")}`);
  const debitosDup = libro.banco.filter((b) => pagosDup.some((p) => p.numero === b.documentoConciliadoId));
  exige("S2", debitosDup.length === 2 && debitosDup.every((b) => b.tipo === "debito"), "faltan los dos débitos en el extracto");

  /* ── S3 · compra fraccionada ── */
  const ocs23 = ocs.filter((d) => d.terceroId === CASOS.fraccionada && d.fecha === "2026-04-16");
  exige("S3", ocs23.length === 6, `${ocs23.length} órdenes el 16/04/2026`);
  exige("S3", ocs23.every((d) => d.montoTotal === 4_800_000), "alguna orden no vale 4.800.000");
  exige("S3", suma(ocs23.map((d) => d.montoTotal)) === 28_800_000, "el total fraccionado no es 28.800.000");
  exige("S3", ocs23.every((d) => d.montoTotal < POLITICAS.umbralAprobacion), "alguna orden supera el umbral por sí sola");

  /* ── S4 · sobrecosto del aceite ── */
  const lineasAceite = libro.lineas.filter((l) => l.sku === CASOS.skuSobrecosto && doc.get(l.documentoId)?.tipo === "factura_compra");
  const delSobrecosto = lineasAceite.filter((l) => doc.get(l.documentoId)!.terceroId === CASOS.sobrecosto);
  const otros = lineasAceite.filter((l) => doc.get(l.documentoId)!.terceroId !== CASOS.sobrecosto);
  const precios = delSobrecosto.map((l) => l.precioUnitario);
  exige("S4", Math.min(...precios) === 86_000 && Math.max(...precios) === 115_240, `rango de precio ${Math.min(...precios)}–${Math.max(...precios)}`);
  exigeRango("S4", casos.sobrecostoS4, 38_000_000, 46_000_000, "sobrecosto acumulado");
  exige("S4", otros.every((l) => l.precioUnitario >= 87_000 && l.precioUnitario <= 90_000), "los otros proveedores no están alrededor de 88.500");

  /* ── S5 · merma recurrente ── */
  const mermas = libro.inventario.filter((m) => m.sku === CASOS.skuMerma && m.bodega === CASOS.bodegaMerma && m.tipo === "ajuste" && m.cantidad < 0);
  const unidades = suma(mermas.map((m) => -m.cantidad));
  exige("S5", mermas.length === 9, `${mermas.length} ajustes negativos de arroz en Guayabal`);
  exige("S5", new Set(mermas.map((m) => m.usuario)).size === 1, "los ajustes no son todos del mismo usuario");
  exige("S5", unidades * item.get(CASOS.skuMerma)!.costoPromedio === 9_200_000, `valen ${cop(unidades * item.get(CASOS.skuMerma)!.costoPromedio)}`);

  /* ── S6 · notas crédito sobre cartera vieja ── */
  const viejas = ncs.filter((d) => casos.notasViejas.includes(d.numero));
  exige("S6", viejas.length === 6, `${viejas.length} notas sobre cartera vieja`);
  exige("S6", suma(viejas.map((d) => d.montoTotal)) === 12_400_000, `suman ${cop(suma(viejas.map((d) => d.montoTotal)))}`);
  exige("S6", viejas.every((d) => d.usuarioRegistro === CASOS.usuarioNotas), "alguna no es de jvargas");
  exige("S6", viejas.every((d) => dias(doc.get(d.facturaAfectadaId!)!.fecha, d.fecha) > 90), "alguna no borra cartera de más de 90 días");
  const pctJvargas = ncs.filter((d) => d.usuarioRegistro === CASOS.usuarioNotas).length / ncs.length;
  exigeRango("S6", Math.round(pctJvargas * 100), 55, 70, "% de notas crédito de jvargas");
  const otrasViejas = ncs.filter((d) => !casos.notasViejas.includes(d.numero) && dias(doc.get(d.facturaAfectadaId!)!.fecha, d.fecha) > 90);
  exige("S6", otrasViejas.length === 0, `${otrasViejas.length} notas crédito viejas fuera del caso`);

  /* ── S7 · el falso positivo ── */
  const gemelas = CASOS.facturasGemelas.map((n) => doc.get(n));
  const pagosGemelos = CASOS.facturasGemelas.map((n) => pagos.filter((p) => p.facturaAfectadaId === n));
  exige("S7", gemelas.every((d) => d?.montoTotal === 1_850_000), `importes ${gemelas.map((d) => d?.montoTotal).join(" / ")}`);
  exige("S7", gemelas[0]?.terceroId === gemelas[1]?.terceroId, "las gemelas no son del mismo proveedor");
  exige("S7", gemelas.every((d) => !!d?.ordenCompraId && !!d?.entradaInventarioId), "alguna gemela no tiene orden o entrada");
  exige("S7", pagosGemelos.every((p) => p.length === 1), "cada gemela tiene que llevar un solo pago");
  exige("S7", dias(pagosGemelos[0][0].fecha, pagosGemelos[1][0].fecha) === 3, `los pagos van a ${dias(pagosGemelos[0][0].fecha, pagosGemelos[1][0].fecha)} días`);
  exige("S7", pagosGemelos.every((p) => libro.banco.some((b) => b.documentoConciliadoId === p[0].numero)), "algún pago gemelo no está conciliado");

  /* ── S8 · pago tras cambio de cuenta ── */
  const cambio = libro.cambiosTercero.find((c) => c.terceroId === CASOS.cambioCuenta && c.campo === "cuenta_bancaria");
  const pago8 = pagos.find((p) => p.terceroId === CASOS.cambioCuenta && p.montoTotal === 8_400_000);
  exige("S8", cambio?.fecha === "2026-06-08", `cambio de cuenta el ${cambio?.fecha}`);
  exige("S8", pago8?.fecha === "2026-06-14", `pago el ${pago8?.fecha}`);
  const cuentaTrasPago = libro.cambiosTercero.filter(
    (c) => c.campo === "cuenta_bancaria" && pagos.some((p) => p.terceroId === c.terceroId && dias(c.fecha, p.fecha) >= 0 && dias(c.fecha, p.fecha) <= 30),
  );
  exige("S8", cuentaTrasPago.length === 1, `${cuentaTrasPago.length} cambios de cuenta seguidos de pago en 30 días`);

  /* ── S9 · pagos sin soporte ── */
  const sinSoporte = libro.banco.filter((b) => b.tipo === "debito" && b.documentoConciliadoId === null && b.monto >= POLITICAS.minimoSoportePago);
  exige("S9", sinSoporte.length === 9, `${sinSoporte.length} débitos sin soporte por encima del mínimo`);
  exige("S9", suma(sinSoporte.map((b) => b.monto)) === 18_600_000, `suman ${cop(suma(sinSoporte.map((b) => b.monto)))}`);
  exige("S9", sinSoporte.filter((b) => b.descripcion.includes("SERVICIOS INTEGRALES JR")).length === 3, "no son tres los de Servicios Integrales JR");

  /* ── S10 · facturas pagadas sin entrada ── */
  const sinEntrada = fcs.filter((d) => d.entradaInventarioId === null);
  exige("S10", sinEntrada.length === 11, `${sinEntrada.length} facturas sin entrada de inventario`);
  exige("S10", sinEntrada.every((d) => pagos.some((p) => p.facturaAfectadaId === d.numero)), "alguna no está pagada");
  exige("S10", suma(sinEntrada.map((d) => d.montoTotal)) === 14_300_000, `suman ${cop(suma(sinEntrada.map((d) => d.montoTotal)))}`);
  const sinOrden = fcs.filter((d) => d.ordenCompraId === null);
  exige("S10", sinOrden.length === 7, `${sinOrden.length} facturas sin orden de compra (deberían ser las 7 de S1)`);

  /* ── S11 · margen por debajo de política ── */
  const margenDe = (d: Documento) => {
    const ls = lineasDe.get(d.numero) ?? [];
    const venta = suma(ls.map((l) => l.total));
    const costo = suma(ls.map((l) => l.cantidad * (l.costoUnitario ?? 0)));
    return venta > 0 ? (venta - costo) / venta : 1;
  };
  const bajoMargen = fvs.filter((d) => margenDe(d) < POLITICAS.margenMinimoPct / 100);
  exige("S11", bajoMargen.length === 23, `${bajoMargen.length} facturas por debajo del 12 % de margen`);
  exige("S11", bajoMargen.filter((d) => margenDe(d) < 0).length === 6, "no son seis las de margen negativo");
  exigeRango("S11", casos.sacrificadoS11, 8_800_000, 9_400_000, "margen sacrificado");

  /* ── S12 · descuento fuera de política ── */
  const conDescuento = fvs.filter((d) => (lineasDe.get(d.numero) ?? []).some((l) => l.descuentoPct > POLITICAS.descuentoMaximoPct));
  exige("S12", conDescuento.length === 31, `${conDescuento.length} facturas con descuento por encima del 8 %`);
  exige("S12", conDescuento.every((d) => d.usuarioRegistro === "lramos"), "alguna no es de lramos");
  exige("S12", conDescuento.every((d) => (lineasDe.get(d.numero) ?? []).every((l) => l.descuentoPct === 0 || (l.descuentoPct >= 14 && l.descuentoPct <= 22))), "algún descuento se sale del 14–22 %");
  exigeRango("S12", casos.sacrificadoS12, 7_100_000, 7_700_000, "descuento sacrificado");

  /* ── S13 · recompra anómala ── */
  const comprasRecompra = fcs
    .filter((d) => (lineasDe.get(d.numero) ?? []).some((l) => l.sku === CASOS.skuRecompra))
    .sort((a, b) => (a.fecha < b.fecha ? -1 : 1));
  const ventasRecompra = libro.lineas.filter((l) => l.sku === CASOS.skuRecompra && doc.get(l.documentoId)?.tipo === "factura_venta");
  exige("S13", comprasRecompra.length === 5, `${comprasRecompra.length} compras del SKU de recompra`);
  exige("S13", ventasRecompra.length === 0, "el SKU de recompra registra ventas");
  exige("S13", suma(comprasRecompra.slice(1).map((d) => d.montoTotal)) === 4_900_000, `las cuatro recompras suman ${cop(suma(comprasRecompra.slice(1).map((d) => d.montoTotal)))}`);

  /* ── S14 · huecos en los consecutivos ── */
  const huecos = (serie: string) => {
    const ns = libro.documentos.filter((d) => d.serie === serie).map((d) => d.consecutivo ?? 0).sort((a, b) => a - b);
    const faltan: number[] = [];
    for (let n = ns[0]; n <= ns[ns.length - 1]; n++) if (!ns.includes(n)) faltan.push(n);
    return faltan;
  };
  const huecosRC = huecos("RC");
  const huecosFV = huecos("FV");
  exige("S14", huecosRC.length === 5 && huecosRC[4] - huecosRC[0] === 4, `huecos de recibos: ${huecosRC.join(", ")}`);
  exige("S14", huecosRC[0] === 188, `el primer recibo que falta es el ${huecosRC[0]}, no el 188`);
  exige("S14", huecosFV.length === 2, `huecos de facturas de venta: ${huecosFV.join(", ")}`);
  for (const serie of ["FC", "OC", "ENT", "PAGO", "NC", "ND"]) {
    exige("S14", huecos(serie).length === 0, `la serie ${serie} tiene ${huecos(serie).length} huecos que nadie ha sembrado`);
  }

  /* ── S15 · identificación de terceros ── */
  const malNit = libro.terceros.filter((t) => {
    if (!t.nit) return false;
    const [base, dv] = t.nit.split("-");
    return digitoVerificacion(base) !== Number(dv);
  });
  const sinNit = libro.terceros.filter((t) => !t.nit);
  exige("S15", malNit.length === 3, `${malNit.length} terceros con dígito de verificación incorrecto`);
  exige("S15", sinNit.length === 1, `${sinNit.length} terceros sin NIT`);

  /* ── S16 · venta sin salida y salida huérfana ── */
  const movsDeDoc = new Set(libro.inventario.map((m) => m.documentoId));
  const ventaSinSalida = fvs.filter(
    (d) => !movsDeDoc.has(d.numero) && (lineasDe.get(d.numero) ?? []).some((l) => item.get(l.sku)?.inventariable),
  );
  const huerfanas = libro.inventario.filter((m) => m.tipo === "salida" && m.documentoId === null);
  const valorHuerfanas = suma(huerfanas.map((m) => -m.cantidad * item.get(m.sku)!.costoPromedio));
  const valorSinSalida = suma(ventaSinSalida.map((d) => d.montoTotal));
  exige("S16", ventaSinSalida.length === 7, `${ventaSinSalida.length} ventas sin salida de inventario`);
  exige("S16", huerfanas.length === 5, `${huerfanas.length} salidas huérfanas`);
  exigeRango("S16", valorSinSalida + valorHuerfanas, 6_500_000, 7_100_000, "valor de las ventas sin salida más las huérfanas");

  /* ── S17 · crédito fuera de política ── */
  const cobradas = new Set(rcs.map((d) => d.facturaAfectadaId));
  const credito = fvs.filter((d) => (d.diasCredito ?? 0) > POLITICAS.diasCredito && !cobradas.has(d.numero));
  exige("S17", credito.length === 5, `${credito.length} facturas con crédito fuera de política y sin recibo`);
  exige("S17", Math.max(...credito.map((d) => d.diasCredito ?? 0)) === 96, "el plazo máximo no llega a 96 días");

  /* ── S18 · anomalías estadísticas ── */
  const conRegistro = libro.documentos.filter((d) => d.fechaRegistro);
  const nocturnos = conRegistro.filter((d) => hora(d.fechaRegistro) >= 22 || hora(d.fechaRegistro) < 5);
  const FESTIVOS = new Set(["2025-04-17","2025-04-18","2025-05-01","2025-06-02","2025-06-23","2025-06-30","2025-07-20","2025-08-07","2025-08-18","2025-10-13","2025-11-03","2025-11-17","2025-12-08","2025-12-25","2026-01-01","2026-01-12","2026-03-23","2026-04-02","2026-04-03","2026-05-01","2026-05-18","2026-06-08","2026-06-15","2026-06-29","2026-07-20","2026-08-07","2026-08-17"]);
  const enFestivo = conRegistro.filter((d) => FESTIVOS.has(d.fechaRegistro!.slice(0, 10)));
  const enFinde = conRegistro.filter((d) => [0, 6].includes(new Date(`${d.fechaRegistro!.slice(0, 10)}T00:00:00Z`).getUTCDay()));
  exige("S18", nocturnos.length === 37, `${nocturnos.length} registros entre las 22:00 y las 05:00`);
  exige("S18", nocturnos.filter((d) => d.usuarioRegistro === "mosorio").length === 22, "no son 22 los nocturnos de mosorio");
  exige("S18", enFestivo.length === 12, `${enFestivo.length} registros en festivo`);
  exige("S18", enFinde.length === 0, `${enFinde.length} registros en fin de semana que nadie sembró`);

  const porProveedor = new Map<string, number[]>();
  for (const d of fcs) lista(porProveedor, d.terceroId!).push(d.montoTotal);
  let atipicos = 0;
  for (const montos of porProveedor.values()) {
    if (montos.length < 8) continue;
    const media = suma(montos) / montos.length;
    const sd = Math.sqrt(suma(montos.map((x) => (x - media) ** 2)) / montos.length);
    if (sd > 0) atipicos += montos.filter((x) => (x - media) / sd >= 3).length;
  }
  exigeRango("S18", atipicos, 5, 8, "importes con z ≥ 3");

  const primerDigito = fcs.map((d) => Number(String(Math.round(d.montoTotal))[0]));
  const pct4 = primerDigito.filter((x) => x === 4).length / primerDigito.length;
  exige("S18", pct4 > Math.log10(1 + 1 / 4), `el dígito 4 sale en el ${(pct4 * 100).toFixed(1)} % de las compras, y Benford espera el 9,7 %`);

  /* ── «Ni más ni menos»: las reglas que podrían dispararse solas ──
     Un dataset con los dieciocho casos pero además cincuenta coincidencias
     tontas no sirve: el informe saldría lleno de ruido y el guion dejaría de
     encajar. Estas comprobaciones son las que cuestan de mantener y las que
     permiten que el motor prometa «exactamente esto». */

  const comprasPorSku = new Map<string, { dia: number; prov: string; precio: number }[]>();
  const ventasPorSku = new Map<string, number[]>();
  for (const l of libro.lineas) {
    const d = doc.get(l.documentoId)!;
    const dia = Math.round(Date.parse(`${d.fecha}T00:00:00Z`) / 86_400_000);
    if (d.tipo === "factura_compra") {
      lista(comprasPorSku, l.sku).push({ dia, prov: d.terceroId!, precio: l.precioUnitario });
    } else if (d.tipo === "factura_venta") {
      lista(ventasPorSku, l.sku).push(dia);
    }
  }

  const recompras: string[] = [];
  for (const [sku, cs] of comprasPorSku) {
    const orden = [...cs].sort((a, b) => a.dia - b.dia);
    const vs = ventasPorSku.get(sku) ?? [];
    for (let i = 1; i < orden.length; i++) {
      if (!vs.some((v) => v > orden[i - 1].dia && v <= orden[i].dia)) recompras.push(sku);
    }
  }
  exige(
    "R25",
    recompras.length === 4 && recompras.every((s) => s === CASOS.skuRecompra),
    `${recompras.length} recompras sin rotación intermedia (${[...new Set(recompras)].join(", ")}); solo pueden ser las 4 de S13`,
  );

  const variacion: string[] = [];
  const sobrePrecio: string[] = [];
  const horquilla: string[] = [];
  for (const [sku, cs] of comprasPorSku) {
    const porProv = new Map<string, { dia: number; precio: number }[]>();
    for (const c of cs) lista(porProv, c.prov).push(c);
    for (const [prov, ps] of porProv) {
      for (const a of ps) {
        for (const b of ps) {
          if (Math.abs(a.dia - b.dia) <= 90 && Math.max(a.precio, b.precio) / Math.min(a.precio, b.precio) - 1 > 0.15) {
            variacion.push(`${sku}/${prov}`);
          }
        }
      }
    }
    if (porProv.size < 2) continue;
    const medios = [...porProv.entries()].map(([prov, ps]) => ({ prov, precio: suma(ps.map((x) => x.precio)) / ps.length }));
    const ordenados = medios.map((m) => m.precio).sort((a, b) => a - b);
    const mediana = ordenados[Math.floor(ordenados.length / 2)];
    for (const m of medios) if (m.precio > mediana * 1.2) sobrePrecio.push(`${sku}/${m.prov}`);
    if (ordenados[ordenados.length - 1] / ordenados[0] - 1 > 0.25) horquilla.push(sku);
  }
  const fueraDelAceite = (xs: string[]) => [...new Set(xs)].filter((x) => !x.startsWith(CASOS.skuSobrecosto));
  exige("R20", fueraDelAceite(variacion).length === 0, `precios que se mueven más del 15 % fuera del aceite: ${fueraDelAceite(variacion).slice(0, 5).join(", ")}`);
  exige("R21", fueraDelAceite(sobrePrecio).length === 0, `proveedores un 20 % sobre la mediana fuera del aceite: ${fueraDelAceite(sobrePrecio).slice(0, 5).join(", ")}`);
  exige("R30", fueraDelAceite(horquilla).length === 0, `SKU con horquilla mayor del 25 % fuera del aceite: ${fueraDelAceite(horquilla).slice(0, 5).join(", ")}`);

  const negativos = new Map<string, number[]>();
  for (const m of libro.inventario) {
    if (m.tipo !== "ajuste" || m.cantidad >= 0) continue;
    lista(negativos, `${m.sku}|${m.bodega}`).push(Math.round(Date.parse(`${m.fecha}T00:00:00Z`) / 86_400_000));
  }
  const recurrentes = [...negativos.entries()].filter(([, ds]) => ds.some((a) => ds.filter((b) => b >= a && b - a <= 90).length > 3));
  exige(
    "R26",
    recurrentes.length === 1 && recurrentes[0][0] === `${CASOS.skuMerma}|${CASOS.bodegaMerma}`,
    `mermas recurrentes: ${recurrentes.map(([k]) => k).join(", ")}`,
  );

  const parejas: string[] = [];
  for (let i = 0; i < pagos.length; i++) {
    for (let j = i + 1; j < pagos.length; j++) {
      if (pagos[i].terceroId !== pagos[j].terceroId) continue;
      if (pagos[i].montoTotal !== pagos[j].montoTotal) continue;
      if (Math.abs(dias(pagos[i].fecha, pagos[j].fecha)) > 60) continue;
      parejas.push(`${pagos[i].numero}~${pagos[j].numero}`);
    }
  }
  exige("R01", parejas.length === 2, `${parejas.length} parejas de pagos idénticos en 60 días; solo pueden ser S2 y S7: ${parejas.join(", ")}`);

  const expres = libro.terceros.filter((t) => {
    const primera = fcs.filter((d) => d.terceroId === t.id).map((d) => d.fecha).sort()[0];
    return !!primera && dias(t.fechaCreacion, primera) >= 0 && dias(t.fechaCreacion, primera) <= 3;
  });
  exige("R09", expres.length === 1 && expres[0].id === CASOS.proveedorFantasma, `proveedores exprés: ${expres.map((t) => t.id).join(", ")}`);

  const tandas = new Map<string, Documento[]>();
  for (const o of ocs) lista(tandas, `${o.terceroId}|${o.fecha}`).push(o);
  const fraccionadas = [...tandas.entries()].filter(
    ([, os]) =>
      os.length > 1 &&
      os.every((o) => o.montoTotal < POLITICAS.umbralAprobacion) &&
      suma(os.map((o) => o.montoTotal)) > POLITICAS.umbralAprobacion,
  );
  exige("R11", fraccionadas.length === 1 && fraccionadas[0][0].startsWith(CASOS.fraccionada), `tandas fraccionadas: ${fraccionadas.map(([k]) => k).join(", ")}`);

  return { facturacion, compras, fvs, fcs, pagos, ncs, rcs, ocs, nocturnos, enFestivo, pct4 };
}

/**
 * Vuelve a abrir los ficheros escritos y comprueba que `origen.fila` apunta a la
 * fila que de verdad contiene ese registro. Es la promesa de la herramienta
 * —pinchas un hallazgo y te lleva a la celda— y es lo único que el generador no
 * puede dar por bueno sin releer lo que acaba de escribir.
 */
function verificarTrazabilidad(libro: Libro) {
  const cache = new Map<string, unknown[][]>();
  const filaDe = (archivo: string, hj: string, fila: number): unknown[] => {
    const clave = `${archivo}|${hj}`;
    let filas = cache.get(clave);
    if (!filas) {
      const wb = XLSX.readFile(join(DESTINOS[0], archivo));
      filas = XLSX.utils.sheet_to_json<unknown[]>(wb.Sheets[hj], { header: 1, blankrows: true, defval: "" });
      cache.set(clave, filas);
    }
    return (filas[fila - 1] ?? []) as unknown[];
  };
  let malas = 0;
  const mira = (o: { archivo: string; hoja: string; fila: number }, columna: number, esperado: string | number) => {
    if (String(filaDe(o.archivo, o.hoja, o.fila)[columna]) !== String(esperado)) malas++;
  };
  for (const t of libro.terceros) mira(t.origen, 0, t.id);
  for (const c of libro.cambiosTercero) mira(c.origen, 0, c.terceroId);
  for (const d of libro.documentos) mira(d.origen, 1, d.numero);
  for (const l of libro.lineas) mira(l.origen, 0, l.documentoId);
  for (const m of libro.inventario) mira(m.origen, 0, m.id);
  for (const i of libro.items) mira(i.origen, 0, i.sku);
  for (const b of libro.banco) mira(b.origen, 1, b.descripcion);
  exige("TRAZA", malas === 0, `${malas} registros cuya fila del Excel no coincide con su origen`);
}

/* ─────────────────────────────  Corrida  ───────────────────────────── */

const huella = (libro: Libro) => createHash("sha256").update(JSON.stringify(libro)).digest("hex");

function main() {
  const t0 = Date.now();
  const { libro, casos } = construirDataset();
  const conteos = generar(libro);
  const resumen = verificar(libro, casos);
  verificarTrazabilidad(libro);

  console.log(`\n  ${EMPRESA} · NIT ${NIT_EMPRESA} · ${PERIODO.desde} → ${PERIODO.hasta}\n`);
  console.log(`  Terceros          ${String(conteos.terceros).padStart(6)}   (60 proveedores · 45 clientes · 12 empleados)`);
  console.log(`  Cambios maestro   ${String(conteos.cambios).padStart(6)}`);
  console.log(`  Documentos        ${String(conteos.documentos).padStart(6)}   OC ${resumen.ocs.length} · FC ${resumen.fcs.length} · PAGO ${resumen.pagos.length} · FV ${resumen.fvs.length} · NC ${resumen.ncs.length} · RC ${resumen.rcs.length}`);
  console.log(`  Líneas            ${String(conteos.lineas).padStart(6)}`);
  console.log(`  Mov. inventario   ${String(conteos.inventario).padStart(6)}`);
  console.log(`  Mov. banco        ${String(conteos.banco).padStart(6)}`);
  console.log(`  Referencias       ${String(conteos.items).padStart(6)}`);
  console.log(`\n  Facturación       ${copCorto(resumen.facturacion).padStart(12)}`);
  console.log(`  Compras           ${copCorto(resumen.compras).padStart(12)}`);
  console.log(`  Sobrecosto S4     ${copCorto(casos.sobrecostoS4).padStart(12)}`);
  console.log(`  Margen S11        ${copCorto(casos.sacrificadoS11).padStart(12)}`);
  console.log(`  Descuento S12     ${copCorto(casos.sacrificadoS12).padStart(12)}`);
  console.log(`  Fuera de horario  ${String(resumen.nocturnos.length).padStart(6)} de madrugada · ${resumen.enFestivo.length} en festivo`);
  console.log(`  Benford dígito 4  ${(resumen.pct4 * 100).toFixed(1)} %  (esperado 9,7 %)`);

  const a = huella(libro);
  const b = huella(construirDataset().libro);
  exige("DETERMINISMO", a === b, `dos ejecuciones dan libros distintos (${a.slice(0, 12)} ≠ ${b.slice(0, 12)})`);

  console.log(`\n  Escritos en:`);
  for (const d of DESTINOS) console.log(`    ${d}`);
  console.log(`  Huella del libro  ${a.slice(0, 16)}`);
  console.log(`\n  ${comprobadas} invariantes comprobadas en ${Date.now() - t0} ms`);

  if (fallos.length) {
    console.error(`\n  ${fallos.length} INVARIANTES ROTAS:\n`);
    for (const f of fallos) console.error(`    ✗ ${f}`);
    console.error("");
    process.exit(1);
  }
  console.log(`  Todo cuadra.\n`);
}

main();
