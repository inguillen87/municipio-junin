// ============================================================
// DB.JS — MuniControl Local Database Engine v2.0
// Simulates a real DB using localStorage with full CRUD
// Tables: empleados, presupuesto, licitaciones, reclamos,
//         contratos, pagos, proveedores, obras, usuarios
// ============================================================

(function(global) {
  'use strict';

  const DB_VERSION = '2.0';
  const DB_PREFIX = 'muni_db_';

  // ── TABLE SCHEMAS ──────────────────────────────────────────
  const SCHEMAS = {
    empleados: { pk: 'id', fields: ['id','legajo','nombre','apellido','dni','secretaria','cargo','categoria','estado','fechaIngreso','salario','horasExtra','ausentismo','email','telefono','domicilio'] },
    presupuesto: { pk: 'id', fields: ['id','secretaria','rubro','descripcion','asignado','ejecutado','comprometido','periodo','estado'] },
    licitaciones: { pk: 'id', fields: ['id','numero','titulo','tipo','estado','montoBase','montoAdjudicado','proveedor','fechaApertura','fechaVencimiento','secretaria','descripcion'] },
    reclamos: { pk: 'id', fields: ['id','numero','tipo','descripcion','estado','prioridad','barrio','calle','lat','lng','foto','vecino','telefono','fechaIngreso','fechaLimite','asignadoA','sla','notas'] },
    contratos: { pk: 'id', fields: ['id','numero','proveedor','descripcion','monto','fechaInicio','fechaFin','estado','secretaria','renovable','garantia'] },
    pagos: { pk: 'id', fields: ['id','fecha','proveedor','concepto','monto','secretaria','ordenCompra','estado','aprobadoPor','categoria'] },
    proveedores: { pk: 'id', fields: ['id','razonSocial','cuit','rubro','contacto','email','telefono','direccion','estado','calificacion','contratos'] },
    obras: { pk: 'id', fields: ['id','nombre','descripcion','estado','avance','presupuesto','ejecutado','contratista','barrio','lat','lng','fechaInicio','fechaFin','fotos','inspector'] },
    usuarios: { pk: 'id', fields: ['id','nombre','email','rol','secretaria','activo','ultimoAcceso','permisos'] },
    auditoria: { pk: 'id', fields: ['id','timestamp','usuario','accion','modulo','recurso','detalles','ip'] }
  };

  // ── SEED DATA ──────────────────────────────────────────────
  const SEEDS = {
    empleados: [
      {id:'E001',legajo:'L-1001',nombre:'María',apellido:'González',dni:'28445123',secretaria:'Salud',cargo:'Médica',categoria:'P-1',estado:'activo',fechaIngreso:'2018-03-15',salario:185000,horasExtra:12,ausentismo:2,email:'mgonzalez@junin.gob.ar',telefono:'2362-441123',domicilio:'San Martín 1245'},
      {id:'E002',legajo:'L-1002',nombre:'Carlos',apellido:'Rodríguez',dni:'32110456',secretaria:'Obras Públicas',cargo:'Ingeniero Civil',categoria:'P-2',estado:'activo',fechaIngreso:'2015-07-01',salario:210000,horasExtra:28,ausentismo:0,email:'crodriguez@junin.gob.ar',telefono:'2362-552234',domicilio:'Belgrano 567'},
      {id:'E003',legajo:'L-1003',nombre:'Ana',apellido:'Martínez',dni:'35789012',secretaria:'Educación',cargo:'Coordinadora',categoria:'P-1',estado:'activo',fechaIngreso:'2020-02-10',salario:165000,horasExtra:5,ausentismo:8,email:'amartinez@junin.gob.ar',telefono:'2362-663345',domicilio:'Rivadavia 890'},
      {id:'E004',legajo:'L-1004',nombre:'Roberto',apellido:'López',dni:'25334890',secretaria:'Seguridad',cargo:'Inspector',categoria:'A-2',estado:'activo',fechaIngreso:'2012-11-20',salario:145000,horasExtra:45,ausentismo:3,email:'rlopez@junin.gob.ar',telefono:'2362-774456',domicilio:'Mitre 234'},
      {id:'E005',legajo:'L-1005',nombre:'Silvia',apellido:'Fernández',dni:'30567234',secretaria:'Hacienda',cargo:'Contadora',categoria:'P-1',estado:'activo',fechaIngreso:'2017-05-03',salario:195000,horasExtra:18,ausentismo:1,email:'sfernandez@junin.gob.ar',telefono:'2362-885567',domicilio:'Sarmiento 678'},
      {id:'E006',legajo:'L-1006',nombre:'Diego',apellido:'Sánchez',dni:'37890123',secretaria:'Medio Ambiente',cargo:'Técnico',categoria:'A-1',estado:'activo',fechaIngreso:'2021-08-15',salario:125000,horasExtra:8,ausentismo:5,email:'dsanchez@junin.gob.ar',telefono:'2362-996678',domicilio:'Alvear 345'},
      {id:'E007',legajo:'L-1007',nombre:'Laura',apellido:'Pérez',dni:'29223456',secretaria:'Cultura',cargo:'Directora',categoria:'P-3',estado:'activo',fechaIngreso:'2016-01-10',salario:220000,horasExtra:22,ausentismo:0,email:'lperez@junin.gob.ar',telefono:'2362-107789',domicilio:'Moreno 789'},
      {id:'E008',legajo:'L-1008',nombre:'Miguel',apellido:'Torres',dni:'33445678',secretaria:'RRHH',cargo:'Analista',categoria:'A-2',estado:'licencia',fechaIngreso:'2019-04-20',salario:155000,horasExtra:0,ausentismo:30,email:'mtorres@junin.gob.ar',telefono:'2362-118890',domicilio:'Independencia 123'},
      {id:'E009',legajo:'L-1009',nombre:'Patricia',apellido:'Ruiz',dni:'26778901',secretaria:'Salud',cargo:'Enfermera',categoria:'A-1',estado:'activo',fechaIngreso:'2014-09-05',salario:140000,horasExtra:35,ausentismo:4,email:'pruiz@junin.gob.ar',telefono:'2362-229901',domicilio:'O\'Higgins 456'},
      {id:'E010',legajo:'L-1010',nombre:'Fernando',apellido:'Díaz',dni:'38901234',secretaria:'Obras Públicas',cargo:'Operario',categoria:'O-1',estado:'activo',fechaIngreso:'2022-03-01',salario:115000,horasExtra:20,ausentismo:2,email:'fdiaz@junin.gob.ar',telefono:'2362-330012',domicilio:'Castelli 234'},
      {id:'E011',legajo:'L-1011',nombre:'Claudia',apellido:'Herrera',dni:'31234567',secretaria:'Educación',cargo:'Docente',categoria:'P-1',estado:'activo',fechaIngreso:'2013-02-15',salario:175000,horasExtra:0,ausentismo:6,email:'cherrera@junin.gob.ar',telefono:'2362-441123',domicilio:'Chacabuco 567'},
      {id:'E012',legajo:'L-1012',nombre:'Alejandro',apellido:'Morales',dni:'36123456',secretaria:'Seguridad',cargo:'Agente',categoria:'A-1',estado:'activo',fechaIngreso:'2020-10-01',salario:130000,horasExtra:55,ausentismo:1,email:'amorales@junin.gob.ar',telefono:'2362-552234',domicilio:'9 de Julio 890'},
      {id:'E013',legajo:'L-1013',nombre:'Verónica',apellido:'Gómez',dni:'27890123',secretaria:'Hacienda',cargo:'Tesorera',categoria:'P-2',estado:'activo',fechaIngreso:'2011-06-20',salario:205000,horasExtra:10,ausentismo:2,email:'vgomez@junin.gob.ar',telefono:'2362-663345',domicilio:'Lavalle 123'},
      {id:'E014',legajo:'L-1014',nombre:'Sebastián',apellido:'Vargas',dni:'39012345',secretaria:'Medio Ambiente',cargo:'Inspector',categoria:'A-2',estado:'activo',fechaIngreso:'2023-01-15',salario:120000,horasExtra:15,ausentismo:3,email:'svargas@junin.gob.ar',telefono:'2362-774456',domicilio:'Pellegrini 456'},
      {id:'E015',legajo:'L-1015',nombre:'Marcela',apellido:'Jiménez',dni:'34567890',secretaria:'Cultura',cargo:'Coordinadora',categoria:'P-1',estado:'activo',fechaIngreso:'2018-08-10',salario:170000,horasExtra:7,ausentismo:0,email:'mjimenez@junin.gob.ar',telefono:'2362-885567',domicilio:'España 789'},
      {id:'E016',legajo:'L-1016',nombre:'Juan',apellido:'Castro',dni:'24556789',secretaria:'RRHH',cargo:'Jefe de Área',categoria:'P-2',estado:'activo',fechaIngreso:'2010-03-01',salario:215000,horasExtra:14,ausentismo:1,email:'jcastro@junin.gob.ar',telefono:'2362-996678',domicilio:'Italia 234'},
      {id:'E017',legajo:'L-1017',nombre:'Andrea',apellido:'Núñez',dni:'32678901',secretaria:'Obras Públicas',cargo:'Arquitecta',categoria:'P-1',estado:'activo',fechaIngreso:'2016-11-05',salario:190000,horasExtra:30,ausentismo:0,email:'anunez@junin.gob.ar',telefono:'2362-107789',domicilio:'Francia 567'},
      {id:'E018',legajo:'L-1018',nombre:'Gonzalo',apellido:'Reyes',dni:'37234567',secretaria:'Salud',cargo:'Kinesiólogo',categoria:'P-1',estado:'activo',fechaIngreso:'2021-05-20',salario:160000,horasExtra:6,ausentismo:4,email:'greyes@junin.gob.ar',telefono:'2362-118890',domicilio:'Av. San Martín 1890'},
      {id:'E019',legajo:'L-1019',nombre:'Natalia',apellido:'Acosta',dni:'28345678',secretaria:'Educación',cargo:'Psicóloga',categoria:'P-1',estado:'activo',fechaIngreso:'2015-09-15',salario:175000,horasExtra:3,ausentismo:7,email:'nacosta@junin.gob.ar',telefono:'2362-229901',domicilio:'Av. Rep. Argentina 456'},
      {id:'E020',legajo:'L-1020',nombre:'Ramón',apellido:'Mendoza',dni:'30789012',secretaria:'Seguridad',cargo:'Comisario',categoria:'P-3',estado:'activo',fechaIngreso:'2008-01-10',salario:230000,horasExtra:20,ausentismo:0,email:'rmendoza@junin.gob.ar',telefono:'2362-330012',domicilio:'Av. Rivadavia 789'},      {id:'E021',legajo:'L-1021',nombre:'Luis',apellido:'Silva',dni:'29123456',secretaria:'Obras Públicas',cargo:'Técnico',categoria:'P-2',estado:'activo',fechaIngreso:'2017-02-14',salario:180000,horasExtra:10,ausentismo:1,email:'lsilva@junin.gob.ar',telefono:'2362-001122',domicilio:'Av. Alvear 100'},
      {id:'E022',legajo:'L-1022',nombre:'Sofía',apellido:'Rojas',dni:'33456789',secretaria:'Hacienda',cargo:'Analista',categoria:'P-1',estado:'activo',fechaIngreso:'2019-06-20',salario:195000,horasExtra:5,ausentismo:0,email:'srojas@junin.gob.ar',telefono:'2362-001133',domicilio:'Mitre 150'},
      {id:'E023',legajo:'L-1023',nombre:'Martín',apellido:'García',dni:'27889900',secretaria:'Seguridad',cargo:'Inspector',categoria:'A-2',estado:'activo',fechaIngreso:'2014-08-10',salario:150000,horasExtra:40,ausentismo:2,email:'mgarcia@junin.gob.ar',telefono:'2362-001144',domicilio:'San Martín 500'},
      {id:'E024',legajo:'L-1024',nombre:'Lucía',apellido:'Benítez',dni:'31556677',secretaria:'Salud',cargo:'Enfermera',categoria:'A-1',estado:'licencia',fechaIngreso:'2016-11-05',salario:145000,horasExtra:0,ausentismo:10,email:'lbenitez@junin.gob.ar',telefono:'2362-001155',domicilio:'Belgrano 800'},
      {id:'E025',legajo:'L-1025',nombre:'Pablo',apellido:'Romero',dni:'35998877',secretaria:'Medio Ambiente',cargo:'Operario',categoria:'O-1',estado:'activo',fechaIngreso:'2021-03-12',salario:120000,horasExtra:25,ausentismo:0,email:'promero@junin.gob.ar',telefono:'2362-001166',domicilio:'Rivadavia 1200'},
      {id:'E026',legajo:'L-1026',nombre:'Camila',apellido:'Sosa',dni:'38112233',secretaria:'Educación',cargo:'Docente',categoria:'P-1',estado:'activo',fechaIngreso:'2022-02-15',salario:170000,horasExtra:0,ausentismo:4,email:'csosa@junin.gob.ar',telefono:'2362-001177',domicilio:'Sarmiento 450'},
      {id:'E027',legajo:'L-1027',nombre:'Javier',apellido:'Flores',dni:'26445566',secretaria:'Cultura',cargo:'Productor',categoria:'P-2',estado:'activo',fechaIngreso:'2013-09-01',salario:185000,horasExtra:15,ausentismo:1,email:'jflores@junin.gob.ar',telefono:'2362-001188',domicilio:'Moreno 320'},
      {id:'E028',legajo:'L-1028',nombre:'Micaela',apellido:'Gutiérrez',dni:'34778899',secretaria:'RRHH',cargo:'Asistente',categoria:'A-3',estado:'activo',fechaIngreso:'2020-05-18',salario:135000,horasExtra:8,ausentismo:2,email:'mgutierrez@junin.gob.ar',telefono:'2362-001199',domicilio:'Alberdi 600'},
      {id:'E029',legajo:'L-1029',nombre:'Diego',apellido:'Suárez',dni:'30223344',secretaria:'Obras Públicas',cargo:'Arquitecto',categoria:'P-3',estado:'activo',fechaIngreso:'2015-12-01',salario:220000,horasExtra:20,ausentismo:0,email:'dsuarez@junin.gob.ar',telefono:'2362-001200',domicilio:'Pellegrini 750'},
      {id:'E030',legajo:'L-1030',nombre:'Florencia',apellido:'Castro',dni:'39556611',secretaria:'Salud',cargo:'Administrativa',categoria:'A-2',estado:'activo',fechaIngreso:'2023-04-10',salario:140000,horasExtra:5,ausentismo:1,email:'fcastro@junin.gob.ar',telefono:'2362-001211',domicilio:'Alsina 900'},
      {id:'E031',legajo:'L-1031',nombre:'Maximiliano',apellido:'Díaz',dni:'28887766',secretaria:'Seguridad',cargo:'Oficial',categoria:'A-1',estado:'activo',fechaIngreso:'2011-07-25',salario:155000,horasExtra:50,ausentismo:3,email:'mdiaz@junin.gob.ar',telefono:'2362-001222',domicilio:'Lavalle 200'},
      {id:'E032',legajo:'L-1032',nombre:'Valentina',apellido:'Morales',dni:'36334455',secretaria:'Hacienda',cargo:'Auditora',categoria:'P-2',estado:'activo',fechaIngreso:'2018-10-15',salario:210000,horasExtra:12,ausentismo:0,email:'vmorales@junin.gob.ar',telefono:'2362-001233',domicilio:'Uruguay 150'},
      {id:'E033',legajo:'L-1033',nombre:'Facundo',apellido:'Herrera',dni:'31990011',secretaria:'Medio Ambiente',cargo:'Coordinador',categoria:'P-1',estado:'activo',fechaIngreso:'2016-03-20',salario:185000,horasExtra:18,ausentismo:2,email:'fherrera@junin.gob.ar',telefono:'2362-001244',domicilio:'Chile 400'},
      {id:'E034',legajo:'L-1034',nombre:'Agustina',apellido:'Álvarez',dni:'37112244',secretaria:'Educación',cargo:'Directora',categoria:'P-3',estado:'activo',fechaIngreso:'2014-02-28',salario:235000,horasExtra:5,ausentismo:1,email:'aalvarez@junin.gob.ar',telefono:'2362-001255',domicilio:'Brasil 300'},
      {id:'E035',legajo:'L-1035',nombre:'Tomás',apellido:'Medina',dni:'25667788',secretaria:'Cultura',cargo:'Técnico',categoria:'A-2',estado:'activo',fechaIngreso:'2010-11-10',salario:150000,horasExtra:22,ausentismo:4,email:'tmedina@junin.gob.ar',telefono:'2362-001266',domicilio:'Paraguay 100'},
      {id:'E036',legajo:'L-1036',nombre:'Juliana',apellido:'Ríos',dni:'32445577',secretaria:'RRHH',cargo:'Analista',categoria:'P-1',estado:'activo',fechaIngreso:'2017-07-05',salario:175000,horasExtra:10,ausentismo:1,email:'jrios@junin.gob.ar',telefono:'2362-001277',domicilio:'Bolivia 250'},
      {id:'E037',legajo:'L-1037',nombre:'Lucas',apellido:'Vidal',dni:'29889911',secretaria:'Obras Públicas',cargo:'Topógrafo',categoria:'P-2',estado:'activo',fechaIngreso:'2015-05-15',salario:195000,horasExtra:25,ausentismo:0,email:'lvidal@junin.gob.ar',telefono:'2362-001288',domicilio:'Perú 500'},
      {id:'E038',legajo:'L-1038',nombre:'Daniela',apellido:'Paz',dni:'35112288',secretaria:'Salud',cargo:'Médica',categoria:'P-3',estado:'activo',fechaIngreso:'2019-01-20',salario:240000,horasExtra:15,ausentismo:2,email:'dpaz@junin.gob.ar',telefono:'2362-001299',domicilio:'Colombia 600'},
      {id:'E039',legajo:'L-1039',nombre:'Emiliano',apellido:'Vega',dni:'27556699',secretaria:'Seguridad',cargo:'Agente',categoria:'A-1',estado:'activo',fechaIngreso:'2013-08-10',salario:145000,horasExtra:45,ausentismo:5,email:'evega@junin.gob.ar',telefono:'2362-001300',domicilio:'Venezuela 700'},
      {id:'E040',legajo:'L-1040',nombre:'Rocío',apellido:'Navarro',dni:'38990022',secretaria:'Hacienda',cargo:'Contadora',categoria:'P-1',estado:'activo',fechaIngreso:'2022-11-01',salario:180000,horasExtra:8,ausentismo:0,email:'rnavarro@junin.gob.ar',telefono:'2362-001311',domicilio:'Ecuador 800'},
      {id:'E041',legajo:'L-1041',nombre:'Joaquín',apellido:'Cabrera',dni:'31223355',secretaria:'Medio Ambiente',cargo:'Técnico',categoria:'P-1',estado:'activo',fechaIngreso:'2018-04-15',salario:170000,horasExtra:14,ausentismo:1,email:'jcabrera@junin.gob.ar',telefono:'2362-001322',domicilio:'Uruguay 900'},
      {id:'E042',legajo:'L-1042',nombre:'Carolina',apellido:'Molina',dni:'36778800',secretaria:'Educación',cargo:'Auxiliar',categoria:'A-3',estado:'activo',fechaIngreso:'2020-09-10',salario:125000,horasExtra:5,ausentismo:6,email:'cmolina@junin.gob.ar',telefono:'2362-001333',domicilio:'Paraguay 1000'},
      {id:'E043',legajo:'L-1043',nombre:'Matías',apellido:'Delgado',dni:'28445511',secretaria:'Cultura',cargo:'Gestor',categoria:'P-2',estado:'activo',fechaIngreso:'2014-06-25',salario:190000,horasExtra:10,ausentismo:0,email:'mdelgado@junin.gob.ar',telefono:'2362-001344',domicilio:'Brasil 1100'},
      {id:'E044',legajo:'L-1044',nombre:'Belén',apellido:'Ortiz',dni:'33112266',secretaria:'RRHH',cargo:'Jefa',categoria:'P-3',estado:'activo',fechaIngreso:'2016-12-05',salario:250000,horasExtra:15,ausentismo:1,email:'bortiz@junin.gob.ar',telefono:'2362-001355',domicilio:'Chile 1200'},
      {id:'E045',legajo:'L-1045',nombre:'Esteban',apellido:'Suárez',dni:'26990033',secretaria:'Obras Públicas',cargo:'Ingeniero',categoria:'P-3',estado:'activo',fechaIngreso:'2012-03-10',salario:260000,horasExtra:20,ausentismo:2,email:'esuarez@junin.gob.ar',telefono:'2362-001366',domicilio:'Bolivia 1300'},
      {id:'E046',legajo:'L-1046',nombre:'Mariana',apellido:'Giménez',dni:'39445588',secretaria:'Salud',cargo:'Técnica',categoria:'A-2',estado:'activo',fechaIngreso:'2023-07-20',salario:155000,horasExtra:12,ausentismo:0,email:'mgimenez@junin.gob.ar',telefono:'2362-001377',domicilio:'Perú 1400'},
      {id:'E047',legajo:'L-1047',nombre:'Federico',apellido:'Ponce',dni:'30556622',secretaria:'Seguridad',cargo:'Oficial Mayor',categoria:'P-2',estado:'activo',fechaIngreso:'2015-10-15',salario:195000,horasExtra:35,ausentismo:1,email:'fponce@junin.gob.ar',telefono:'2362-001388',domicilio:'Colombia 1500'},
      {id:'E048',legajo:'L-1048',nombre:'Marta',apellido:'Vera',dni:'24112299',secretaria:'Hacienda',cargo:'Directora',categoria:'J-1',estado:'activo',fechaIngreso:'2005-02-10',salario:320000,horasExtra:5,ausentismo:0,email:'mvera@junin.gob.ar',telefono:'2362-001399',domicilio:'Venezuela 1600'},
      {id:'E049',legajo:'L-1049',nombre:'Ignacio',apellido:'Bustos',dni:'37889944',secretaria:'Medio Ambiente',cargo:'Inspector',categoria:'A-1',estado:'activo',fechaIngreso:'2021-08-01',salario:160000,horasExtra:25,ausentismo:3,email:'ibustos@junin.gob.ar',telefono:'2362-001400',domicilio:'Ecuador 1700'},
      {id:'E050',legajo:'L-1050',nombre:'Paula',apellido:'Ibarra',dni:'34223377',secretaria:'Educación',cargo:'Docente',categoria:'P-1',estado:'activo',fechaIngreso:'2019-05-15',salario:175000,horasExtra:0,ausentismo:2,email:'pibarra@junin.gob.ar',telefono:'2362-001411',domicilio:'Uruguay 1800'}
    ],
    presupuesto: [
      {id:'P001',secretaria:'Salud',rubro:'Personal',descripcion:'Salarios y cargas sociales',asignado:68200000,ejecutado:61180000,comprometido:5500000,periodo:'2026',estado:'normal'},
      {id:'P002',secretaria:'Obras Públicas',rubro:'Bienes de Capital',descripcion:'Obra pública y equipamiento',asignado:54100000,ejecutado:63800000,comprometido:2000000,periodo:'2026',estado:'critico'},
      {id:'P003',secretaria:'Educación',rubro:'Personal',descripcion:'Docentes y auxiliares',asignado:48700000,ejecutado:33100000,comprometido:8000000,periodo:'2026',estado:'normal'},
      {id:'P004',secretaria:'Seguridad',rubro:'Personal',descripcion:'Policía local y agentes',asignado:42300000,ejecutado:38900000,comprometido:2100000,periodo:'2026',estado:'normal'},
      {id:'P005',secretaria:'Personal',rubro:'Personal',descripcion:'RRHH centralizado',asignado:38600000,ejecutado:39800000,comprometido:1500000,periodo:'2026',estado:'advertencia'},
      {id:'P006',secretaria:'Medio Ambiente',rubro:'Servicios',descripcion:'Recolección y tratamiento',asignado:18200000,ejecutado:12900000,comprometido:3000000,periodo:'2026',estado:'normal'},
      {id:'P007',secretaria:'Cultura',rubro:'Transferencias',descripcion:'Subsidios y eventos',asignado:12400000,ejecutado:8700000,comprometido:1200000,periodo:'2026',estado:'normal'},
      {id:'P008',secretaria:'Hacienda',rubro:'Servicios',descripcion:'Gestión financiera',asignado:15800000,ejecutado:11200000,comprometido:2800000,periodo:'2026',estado:'normal'}
    ],
    reclamos: [
      {id:'R001',numero:'JUN-2026-001247',tipo:'Bache',descripcion:'Bache profundo en intersección peligrosa',estado:'urgente',prioridad:'alta',barrio:'Centro',calle:'San Martín y Mitre',lat:-34.5854,lng:-60.9433,vecino:'José Pérez',telefono:'2362-441100',fechaIngreso:'2026-07-28',fechaLimite:'2026-07-31',asignadoA:'Obras Públicas',sla:72,notas:'Reportado por 3 vecinos'},
      {id:'R002',numero:'JUN-2026-001248',tipo:'Luminaria',descripcion:'Luminaria fundida hace 5 días',estado:'pendiente',prioridad:'media',barrio:'Villa del Parque',calle:'Belgrano 1234',lat:-34.5901,lng:-60.9389,vecino:'Ana García',telefono:'2362-552211',fechaIngreso:'2026-07-29',fechaLimite:'2026-07-31',asignadoA:'Obras Públicas',sla:48,notas:''},
      {id:'R003',numero:'JUN-2026-001249',tipo:'Residuos',descripcion:'Contenedor desbordado hace 48hs',estado:'en_proceso',prioridad:'alta',barrio:'Libertad',calle:'Rivadavia 567',lat:-34.5798,lng:-60.9512,vecino:'Pedro Sosa',telefono:'2362-663322',fechaIngreso:'2026-07-27',fechaLimite:'2026-07-30',asignadoA:'Medio Ambiente',sla:24,notas:'Operario en camino'},
      {id:'R004',numero:'JUN-2026-001250',tipo:'Arbolado',descripcion:'Árbol caído sobre vereda',estado:'resuelto',prioridad:'alta',barrio:'Pueblo Nuevo',calle:'Moreno 890',lat:-34.5756,lng:-60.9478,vecino:'María López',telefono:'2362-774433',fechaIngreso:'2026-07-25',fechaLimite:'2026-07-27',asignadoA:'Medio Ambiente',sla:48,notas:'Resuelto en 42hs'},
      {id:'R005',numero:'JUN-2026-001251',tipo:'Agua',descripcion:'Pérdida de agua en la calzada',estado:'urgente',prioridad:'critica',barrio:'Centro',calle:'Sarmiento 345',lat:-34.5823,lng:-60.9445,vecino:'Carlos Ruiz',telefono:'2362-885544',fechaIngreso:'2026-07-30',fechaLimite:'2026-07-30',asignadoA:'Obras Públicas',sla:4,notas:'Urgente - riesgo vial'},
      {id:'R006',numero:'JUN-2026-001252',tipo:'Ruidos',descripcion:'Local con música hasta las 4am',estado:'pendiente',prioridad:'media',barrio:'Palermo',calle:'Alvear 678',lat:-34.5867,lng:-60.9501,vecino:'Lucía Torres',telefono:'2362-996655',fechaIngreso:'2026-07-30',fechaLimite:'2026-08-06',asignadoA:'Seguridad',sla:168,notas:''},      ,{id:'R007',numero:'JUN-2026-001253',tipo:'Bache',descripcion:'Pozo profundo en el asfalto',estado:'pendiente',prioridad:'alta',barrio:'Villa Belgrano',calle:'Av. Libertad 450',lat:-34.5810,lng:-60.9400,vecino:'Hernán Gómez',telefono:'2362-112233',fechaIngreso:'2026-07-31',fechaLimite:'2026-08-03',asignadoA:'Obras Públicas',sla:72,notas:''},
      {id:'R008',numero:'JUN-2026-001254',tipo:'Basura',descripcion:'Ramas tiradas en la vereda',estado:'en_proceso',prioridad:'media',barrio:'Prado Español',calle:'Borges 120',lat:-34.5890,lng:-60.9500,vecino:'Elena Paz',telefono:'2362-223344',fechaIngreso:'2026-07-31',fechaLimite:'2026-08-02',asignadoA:'Medio Ambiente',sla:48,notas:'Camión programado'},
      {id:'R009',numero:'JUN-2026-001255',tipo:'Luminaria',descripcion:'Poste caído por tormenta',estado:'urgente',prioridad:'critica',barrio:'Barrio Norte',calle:'Primera Junta 890',lat:-34.5700,lng:-60.9450,vecino:'Mario Silva',telefono:'2362-334455',fechaIngreso:'2026-08-01',fechaLimite:'2026-08-01',asignadoA:'Obras Públicas',sla:12,notas:'Peligro de electrocución'},
      {id:'R010',numero:'JUN-2026-001256',tipo:'Ruidos',descripcion:'Vecino con música muy alta',estado:'pendiente',prioridad:'baja',barrio:'11 de Julio',calle:'Lebensohn 340',lat:-34.5950,lng:-60.9350,vecino:'Silvana Ruiz',telefono:'2362-445566',fechaIngreso:'2026-08-01',fechaLimite:'2026-08-05',asignadoA:'Seguridad',sla:96,notas:''},
      {id:'R011',numero:'JUN-2026-001257',tipo:'Agua',descripcion:'Caño roto en la esquina',estado:'en_proceso',prioridad:'alta',barrio:'Emilio Mitre',calle:'Av. Arias 1500',lat:-34.5800,lng:-60.9600,vecino:'Ricardo Darín',telefono:'2362-556677',fechaIngreso:'2026-07-30',fechaLimite:'2026-08-01',asignadoA:'Obras Públicas',sla:48,notas:'Cuadrilla reparando'},
      {id:'R012',numero:'JUN-2026-001258',tipo:'Bache',descripcion:'Cráter en la calle de tierra',estado:'pendiente',prioridad:'media',barrio:'Ricardo Rojas',calle:'Pastor Bauman 200',lat:-34.5750,lng:-60.9300,vecino:'Carla Peterson',telefono:'2362-667788',fechaIngreso:'2026-07-29',fechaLimite:'2026-08-05',asignadoA:'Obras Públicas',sla:168,notas:'Esperando que seque'},
      {id:'R013',numero:'JUN-2026-001259',tipo:'Arbolado',descripcion:'Raíces levantando vereda',estado:'resuelto',prioridad:'baja',barrio:'Centro',calle:'General Paz 55',lat:-34.5840,lng:-60.9420,vecino:'Guillermo Francella',telefono:'2362-778899',fechaIngreso:'2026-07-15',fechaLimite:'2026-07-30',asignadoA:'Medio Ambiente',sla:360,notas:'Vereda reparada'},
      {id:'R014',numero:'JUN-2026-001260',tipo:'Basura',descripcion:'Microbasural en baldío',estado:'urgente',prioridad:'alta',barrio:'San Jorge',calle:'RP 65 y R N 7',lat:-34.5600,lng:-60.9700,vecino:'Mirtha Legrand',telefono:'2362-889900',fechaIngreso:'2026-08-01',fechaLimite:'2026-08-02',asignadoA:'Medio Ambiente',sla:24,notas:'Foco infeccioso'},
      {id:'R015',numero:'JUN-2026-001261',tipo:'Luminaria',descripcion:'3 cuadras sin luz',estado:'pendiente',prioridad:'alta',barrio:'Almirante Brown',calle:'Alberdi 1000',lat:-34.5900,lng:-60.9200,vecino:'Susana Giménez',telefono:'2362-990011',fechaIngreso:'2026-08-01',fechaLimite:'2026-08-02',asignadoA:'Obras Públicas',sla:24,notas:'Robo de cables'},
      {id:'R016',numero:'JUN-2026-001262',tipo:'Ruidos',descripcion:'Fiesta clandestina',estado:'resuelto',prioridad:'urgente',barrio:'Cerrito Colorado',calle:'Av. de los Tilos s/n',lat:-34.6000,lng:-60.9800,vecino:'Marcelo Tinelli',telefono:'2362-101122',fechaIngreso:'2026-07-26',fechaLimite:'2026-07-26',asignadoA:'Seguridad',sla:2,notas:'Desarticulada'},
      {id:'R017',numero:'JUN-2026-001263',tipo:'Bache',descripcion:'Hundimiento de asfalto',estado:'en_proceso',prioridad:'media',barrio:'San Cayetano',calle:'Cnel. Suárez 800',lat:-34.5780,lng:-60.9550,vecino:'Moria Casán',telefono:'2362-212233',fechaIngreso:'2026-07-28',fechaLimite:'2026-08-04',asignadoA:'Obras Públicas',sla:168,notas:''},
      {id:'R018',numero:'JUN-2026-001264',tipo:'Agua',descripcion:'Falta de presión de agua',estado:'pendiente',prioridad:'alta',barrio:'Capilla de Loreto',calle:'Suiza 200',lat:-34.5650,lng:-60.9350,vecino:'Charly García',telefono:'2362-323344',fechaIngreso:'2026-08-01',fechaLimite:'2026-08-02',asignadoA:'Obras Públicas',sla:24,notas:'Verificar bomba'},
      {id:'R019',numero:'JUN-2026-001265',tipo:'Arbolado',descripcion:'Poda correctiva solicitada',estado:'pendiente',prioridad:'baja',barrio:'Mayor López',calle:'R. E. de San Martín 400',lat:-34.5880,lng:-60.9600,vecino:'Fito Páez',telefono:'2362-434455',fechaIngreso:'2026-07-20',fechaLimite:'2026-08-20',asignadoA:'Medio Ambiente',sla:720,notas:''},
      {id:'R020',numero:'JUN-2026-001266',tipo:'Basura',descripcion:'Falta recolección hace 2 días',estado:'en_proceso',prioridad:'media',barrio:'Las Moras',calle:'Las Gallaretas s/n',lat:-34.6100,lng:-60.9900,vecino:'Luis Spinetta',telefono:'2362-545566',fechaIngreso:'2026-07-31',fechaLimite:'2026-08-01',asignadoA:'Medio Ambiente',sla:24,notas:'Zona rural'}
    ],
    pagos: [
      {id:'PAG001',fecha:'2026-07-29',proveedor:'Construcciones Del Valle SA',concepto:'Obra pavimentación Av. San Martín',monto:8500000,secretaria:'Obras Públicas',ordenCompra:'OC-2026-0847',estado:'acreditado',aprobadoPor:'Ing. Rodríguez',categoria:'Bienes de Capital'},
      {id:'PAG002',fecha:'2026-07-28',proveedor:'Farmashop SRL',concepto:'Insumos médicos Hospital Municipal',monto:2340000,secretaria:'Salud',ordenCompra:'OC-2026-0848',estado:'acreditado',aprobadoPor:'Dra. González',categoria:'Servicios'},
      {id:'PAG003',fecha:'2026-07-28',proveedor:'Editorial Kapelusz',concepto:'Libros texto escuelas primarias',monto:1890000,secretaria:'Educación',ordenCompra:'OC-2026-0849',estado:'acreditado',aprobadoPor:'Lic. Martínez',categoria:'Bienes de Consumo'},
      {id:'PAG004',fecha:'2026-07-27',proveedor:'Cooperativa Limpieza Verde',concepto:'Servicio recolección residuos julio',monto:4200000,secretaria:'Medio Ambiente',ordenCompra:'OC-2026-0850',estado:'acreditado',aprobadoPor:'Téc. Sánchez',categoria:'Servicios'},
      {id:'PAG005',fecha:'2026-07-26',proveedor:'Tecnología Municipal SAS',concepto:'Mantenimiento plataforma digital',monto:890000,secretaria:'Hacienda',ordenCompra:'OC-2026-0851',estado:'pendiente',aprobadoPor:'Cdra. Fernández',categoria:'Servicios'},
      {id:'PAG006',fecha:'2026-07-25',proveedor:'Alimentos Frescos del Centro',concepto:'Proveeduría comedor municipal',monto:1560000,secretaria:'Salud',ordenCompra:'OC-2026-0852',estado:'acreditado',aprobadoPor:'Dra. González',categoria:'Bienes de Consumo'},
      {id:'PAG007',fecha:'2026-07-24',proveedor:'Seguridad Total SA',concepto:'Equipamiento agentes municipales',monto:3200000,secretaria:'Seguridad',ordenCompra:'OC-2026-0853',estado:'acreditado',aprobadoPor:'Com. Mendoza',categoria:'Bienes de Capital'},
      {id:'PAG008',fecha:'2026-07-23',proveedor:'Banda Municipal de Junín',concepto:'Evento cultural Julio 2026',monto:450000,secretaria:'Cultura',ordenCompra:'OC-2026-0854',estado:'acreditado',aprobadoPor:'Lic. Pérez',categoria:'Transferencias'},      ,{id:'PAG009',fecha:'2026-07-22',proveedor:'Estación de Servicio El Sol',concepto:'Combustible flota municipal',monto:5600000,secretaria:'Hacienda',ordenCompra:'OC-2026-0855',estado:'acreditado',aprobadoPor:'Cdra. Fernández',categoria:'Bienes de Consumo'},
      {id:'PAG010',fecha:'2026-07-21',proveedor:'Ferretería Industrial Gómez',concepto:'Materiales mantenimiento calles',monto:1250000,secretaria:'Obras Públicas',ordenCompra:'OC-2026-0856',estado:'acreditado',aprobadoPor:'Ing. Rodríguez',categoria:'Bienes de Consumo'},
      {id:'PAG011',fecha:'2026-07-20',proveedor:'Librería El Estudiante',concepto:'Útiles escolares',monto:850000,secretaria:'Educación',ordenCompra:'OC-2026-0857',estado:'acreditado',aprobadoPor:'Lic. Martínez',categoria:'Bienes de Consumo'},
      {id:'PAG012',fecha:'2026-07-19',proveedor:'Clínica Centro',concepto:'Exámenes preocupacionales',monto:2100000,secretaria:'RRHH',ordenCompra:'OC-2026-0858',estado:'acreditado',aprobadoPor:'Lic. Torres',categoria:'Servicios'},
      {id:'PAG013',fecha:'2026-07-18',proveedor:'Telecom Argentina SA',concepto:'Servicio telefonía e internet',monto:3400000,secretaria:'Hacienda',ordenCompra:'OC-2026-0859',estado:'acreditado',aprobadoPor:'Cdra. Fernández',categoria:'Servicios'},
      {id:'PAG014',fecha:'2026-07-17',proveedor:'Seguros La Caja',concepto:'Pólizas parque automotor',monto:4500000,secretaria:'Hacienda',ordenCompra:'OC-2026-0860',estado:'acreditado',aprobadoPor:'Cdra. Fernández',categoria:'Servicios'},
      {id:'PAG015',fecha:'2026-07-16',proveedor:'Supermercados ChangoMás',concepto:'Mercadería asistencia social',monto:6800000,secretaria:'Salud',ordenCompra:'OC-2026-0861',estado:'acreditado',aprobadoPor:'Dra. González',categoria:'Bienes de Consumo'},
      {id:'PAG016',fecha:'2026-07-15',proveedor:'Transportes Junín',concepto:'Flete materiales construcción',monto:950000,secretaria:'Obras Públicas',ordenCompra:'OC-2026-0862',estado:'acreditado',aprobadoPor:'Ing. Rodríguez',categoria:'Servicios'},
      {id:'PAG017',fecha:'2026-07-14',proveedor:'Imprenta Gutemberg',concepto:'Folletos campaña vacunación',monto:420000,secretaria:'Salud',ordenCompra:'OC-2026-0863',estado:'acreditado',aprobadoPor:'Dra. González',categoria:'Servicios'},
      {id:'PAG018',fecha:'2026-07-13',proveedor:'Vivero Los Pinos',concepto:'Plantines plazas céntricas',monto:780000,secretaria:'Medio Ambiente',ordenCompra:'OC-2026-0864',estado:'acreditado',aprobadoPor:'Téc. Sánchez',categoria:'Bienes de Consumo'},
      {id:'PAG019',fecha:'2026-07-12',proveedor:'Cooperativa Eléctrica',concepto:'Consumo energía edificios públicos',monto:12500000,secretaria:'Hacienda',ordenCompra:'OC-2026-0865',estado:'acreditado',aprobadoPor:'Cdra. Fernández',categoria:'Servicios'},
      {id:'PAG020',fecha:'2026-07-11',proveedor:'Sonido e Iluminación Pérez',concepto:'Alquiler equipos acto patrio',monto:1100000,secretaria:'Cultura',ordenCompra:'OC-2026-0866',estado:'acreditado',aprobadoPor:'Lic. Pérez',categoria:'Servicios'},
      {id:'PAG021',fecha:'2026-07-10',proveedor:'Catering Delicias',concepto:'Refrigerio jornada capacitación',monto:350000,secretaria:'RRHH',ordenCompra:'OC-2026-0867',estado:'acreditado',aprobadoPor:'Lic. Torres',categoria:'Bienes de Consumo'}
    ],
    proveedores: [
      {id:'V001',razonSocial:'Construcciones Del Valle SA',cuit:'30-71234567-8',rubro:'Construcción',contacto:'Roberto Del Valle',email:'rdelvalle@cdvsa.com.ar',telefono:'011-4789-0123',direccion:'Av. Rivadavia 1234, CABA',estado:'habilitado',calificacion:4.5,contratos:3},
      {id:'V002',razonSocial:'Farmashop SRL',cuit:'30-69876543-2',rubro:'Salud',contacto:'Laura Giménez',email:'lgimenez@farmashop.com.ar',telefono:'2362-441234',direccion:'San Martín 456, Junín',estado:'habilitado',calificacion:4.8,contratos:5},
      {id:'V003',razonSocial:'Cooperativa Limpieza Verde',cuit:'30-78901234-5',rubro:'Servicios',contacto:'Miguel Sosa',email:'msosa@limpiezaverde.coop',telefono:'2362-552345',direccion:'Belgrano 789, Junín',estado:'habilitado',calificacion:4.2,contratos:2},
      {id:'V004',razonSocial:'Tecnología Municipal SAS',cuit:'30-87654321-9',rubro:'Tecnología',contacto:'Ana Vidal',email:'avidal@tecmunicipal.com',telefono:'011-5234-5678',direccion:'Reconquista 789, CABA',estado:'habilitado',calificacion:4.7,contratos:1},
    ],
    obras: [
      {id:'O001',nombre:'Pavimentación Av. San Martín',descripcion:'Repavimentación 2km con hormigón',estado:'en_ejecucion',avance:68,presupuesto:18500000,ejecutado:12580000,contratista:'Construcciones Del Valle SA',barrio:'Centro',lat:-34.5854,lng:-60.9433,fechaInicio:'2026-05-01',fechaFin:'2026-09-30',fotos:['obra1.jpg'],inspector:'Ing. Rodríguez'},
      {id:'O002',nombre:'Red Cloacal Villa del Parque',descripcion:'Extensión red cloacal 1.5km',estado:'en_ejecucion',avance:35,presupuesto:12300000,ejecutado:4305000,contratista:'Hidráulica Sur SA',barrio:'Villa del Parque',lat:-34.5901,lng:-60.9389,fechaInicio:'2026-06-15',fechaFin:'2026-11-30',fotos:[],inspector:'Ing. Vargas'},
      {id:'O003',nombre:'Puesta en valor Plaza Belgrano',descripcion:'Renovación completa con juegos inclusivos',estado:'finalizada',avance:100,presupuesto:3800000,ejecutado:3920000,contratista:'Parques y Jardines SA',barrio:'Centro',lat:-34.5823,lng:-60.9445,fechaInicio:'2026-03-01',fechaFin:'2026-06-30',fotos:['plaza1.jpg','plaza2.jpg'],inspector:'Arq. Núñez'},
      {id:'O004',nombre:'Centro Deportivo Municipal',descripcion:'Construcción vestuarios y cancha techada',estado:'en_ejecucion',avance:22,presupuesto:25000000,ejecutado:5500000,contratista:'Obras y Servicios SA',barrio:'Pueblo Nuevo',lat:-34.5756,lng:-60.9478,fechaInicio:'2026-07-01',fechaFin:'2027-03-31',fotos:[],inspector:'Ing. Rodríguez'},      ,{id:'O005',nombre:'Iluminación LED Av. Circunvalación',descripcion:'Instalación 150 columnas LED',estado:'en_ejecucion',avance:45,presupuesto:45000000,ejecutado:20250000,contratista:'ElectroJunín SRL',barrio:'Barrio 9 de Julio',lat:-34.5700,lng:-60.9600,fechaInicio:'2026-06-01',fechaFin:'2026-10-31',fotos:[],inspector:'Ing. Gómez'},
      {id:'O006',nombre:'Bicisenda Parque Borchex',descripcion:'Asfalto y demarcación 3km',estado:'en_ejecucion',avance:80,presupuesto:15000000,ejecutado:12000000,contratista:'Caminos y Puentes SA',barrio:'Barrio Norte',lat:-34.5750,lng:-60.9300,fechaInicio:'2026-04-15',fechaFin:'2026-08-15',fotos:[],inspector:'Arq. López'},
      {id:'O007',nombre:'Ampliación CAPS Villa Belgrano',descripcion:'Nuevos consultorios y sala espera',estado:'planificada',avance:0,presupuesto:28000000,ejecutado:0,contratista:'A definir',barrio:'Villa Belgrano',lat:-34.5800,lng:-60.9400,fechaInicio:'2026-09-01',fechaFin:'2027-02-28',fotos:[],inspector:'Arq. Núñez'}
    ]
  };

  // ── CORE ENGINE ────────────────────────────────────────────
  const MuniDB = {

    // Initialize all tables
    init() {
      const version = localStorage.getItem(DB_PREFIX + 'version');
      if (version !== DB_VERSION) {
        console.log('[MuniDB] Seeding database v' + DB_VERSION);
        Object.keys(SEEDS).forEach(table => {
          if (!localStorage.getItem(DB_PREFIX + table)) {
            localStorage.setItem(DB_PREFIX + table, JSON.stringify(SEEDS[table]));
          }
        });
        localStorage.setItem(DB_PREFIX + 'version', DB_VERSION);
      }
      return this;
    },

    // Get all records from a table
    getAll(table) {
      try {
        return JSON.parse(localStorage.getItem(DB_PREFIX + table) || '[]');
      } catch { return []; }
    },

    // Get one record by id
    getOne(table, id) {
      return this.getAll(table).find(r => r[SCHEMAS[table]?.pk || 'id'] === id) || null;
    },

    // Query with filters
    query(table, filters = {}) {
      let records = this.getAll(table);
      Object.keys(filters).forEach(key => {
        const val = filters[key];
        if (val === null || val === undefined || val === '') return;
        records = records.filter(r => {
          if (typeof val === 'string') return String(r[key]).toLowerCase().includes(val.toLowerCase());
          return r[key] === val;
        });
      });
      return records;
    },

    // Insert a new record
    insert(table, data) {
      const records = this.getAll(table);
      const id = data.id || (table.charAt(0).toUpperCase() + String(Date.now()).slice(-6));
      const record = { ...data, id, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() };
      records.push(record);
      localStorage.setItem(DB_PREFIX + table, JSON.stringify(records));
      this._audit('INSERT', table, id);
      return record;
    },

    // Update existing record
    update(table, id, data) {
      const records = this.getAll(table);
      const pk = SCHEMAS[table]?.pk || 'id';
      const idx = records.findIndex(r => r[pk] === id);
      if (idx === -1) return null;
      records[idx] = { ...records[idx], ...data, updatedAt: new Date().toISOString() };
      localStorage.setItem(DB_PREFIX + table, JSON.stringify(records));
      this._audit('UPDATE', table, id);
      return records[idx];
    },

    // Delete a record
    delete(table, id) {
      const records = this.getAll(table);
      const pk = SCHEMAS[table]?.pk || 'id';
      const filtered = records.filter(r => r[pk] !== id);
      localStorage.setItem(DB_PREFIX + table, JSON.stringify(filtered));
      this._audit('DELETE', table, id);
      return true;
    },

    // Sort records
    sort(records, field, direction = 'asc') {
      return [...records].sort((a, b) => {
        const av = a[field], bv = b[field];
        const cmp = typeof av === 'number' ? av - bv : String(av).localeCompare(String(bv));
        return direction === 'desc' ? -cmp : cmp;
      });
    },

    // Paginate records
    paginate(records, page, perPage) {
      const start = (page - 1) * perPage;
      return {
        data: records.slice(start, start + perPage),
        total: records.length,
        page,
        perPage,
        pages: Math.ceil(records.length / perPage)
      };
    },

    // Aggregate functions
    sum(records, field) { return records.reduce((a, r) => a + (Number(r[field]) || 0), 0); },
    avg(records, field) { const s = this.sum(records, field); return records.length ? s / records.length : 0; },
    count(records) { return records.length; },
    groupBy(records, field) {
      return records.reduce((acc, r) => {
        const key = r[field] || 'Sin definir';
        if (!acc[key]) acc[key] = [];
        acc[key].push(r);
        return acc;
      }, {});
    },

    // Export table as JSON
    exportJSON(table) {
      const data = this.getAll(table);
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `muni_${table}_${new Date().toISOString().slice(0,10)}.json`;
      a.click();
      URL.revokeObjectURL(url);
    },

    // Export full DB
    exportFull() {
      const full = {};
      Object.keys(SCHEMAS).forEach(t => { full[t] = this.getAll(t); });
      const blob = new Blob([JSON.stringify({ version: DB_VERSION, exported: new Date().toISOString(), tables: full }, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `municontrol_backup_${new Date().toISOString().slice(0,10)}.json`;
      a.click();
      URL.revokeObjectURL(url);
    },

    // Get DB stats
    stats() {
      const s = {};
      Object.keys(SCHEMAS).forEach(t => { s[t] = this.getAll(t).length; });
      return s;
    },

    // Audit log
    _audit(action, table, id) {
      try {
        const user = JSON.parse(sessionStorage.getItem('mjunin_user') || '{}');
        const logs = JSON.parse(localStorage.getItem(DB_PREFIX + 'auditoria') || '[]');
        logs.unshift({
          id: 'AUD' + Date.now(),
          timestamp: new Date().toISOString(),
          usuario: user.email || 'sistema',
          accion: action,
          modulo: table,
          recurso: id,
          detalles: '',
          ip: 'local'
        });
        // Keep last 500 audit entries
        localStorage.setItem(DB_PREFIX + 'auditoria', JSON.stringify(logs.slice(0, 500)));
      } catch {}
    }
  };

  // ── AUTO-INIT ──────────────────────────────────────────────
  MuniDB.init();

  // ── EXPOSE GLOBALLY ────────────────────────────────────────
  global.MuniDB = MuniDB;
  global.DB = MuniDB; // shorthand

  console.log('[MuniDB] Ready. Tables:', MuniDB.stats());

})(window);

