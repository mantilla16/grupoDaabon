export type EntityType = 'SAS' | 'SCA' | 'SA' | 'PN' | 'Otro'

export interface Company {
  id: number
  name: string
  nit: string
  type: EntityType
}

export interface Ownership {
  from: number
  to: number
  weight: string | null
}

export interface GraphData {
  nodes: Company[]
  edges: Ownership[]
}

export const INITIAL_DATA: GraphData = {
  nodes: [
    { id: 46, name: 'Namaca & CIA SCA', nit: '819.003.488-5', type: 'SCA' },
    { id: 47, name: 'M&M Dávila y CIA SCA', nit: '819.002.718-2', type: 'SCA' },
    { id: 48, name: 'MIA Corporation SAS', nit: '900.033.653-6', type: 'SAS' },
    { id: 49, name: 'Inversiones New Land SAS', nit: '819.004.454-1', type: 'SAS' },
    { id: 50, name: 'EYD & CIA SCA', nit: '900.042.926-1', type: 'SCA' },
    { id: 51, name: 'AFD Corporation & CIA SCA', nit: '900.033.653-6', type: 'SCA' },
    { id: 52, name: 'CI Tequendama', nit: '900.033.653-6', type: 'Otro' },
    { id: 53, name: 'CI La Samaria', nit: '819.003.792-1', type: 'Otro' },
    { id: 111, name: 'Derivados y Fracciones de Palma SAS', nit: '900.033.653-6', type: 'SAS' },
    { id: 136, name: 'FDF Investment & CIA SCA', nit: '900.763.029-1', type: 'SCA' },
    { id: 153, name: 'Inversiones FDF SAS', nit: '900.272.768-9', type: 'SAS' },
    { id: 154, name: 'AP DAVILA SAS', nit: '900.304.963-0', type: 'SAS' },
    { id: 155, name: 'FDF Investment Corporation', nit: '25920131832439', type: 'SA' },
    { id: 188, name: 'Biocombustible SA', nit: '900.117.087-9', type: 'SA' },
    { id: 213, name: 'ECO BIO Colombia SAS', nit: '900.272.768-9', type: 'SAS' },
    { id: 222, name: 'Elogia Soluciones Logísticas', nit: '819.004.116-5', type: 'Otro' },
    { id: 227, name: 'Inversiones Soviva SAS', nit: '900.267.069-9', type: 'SAS' },
    { id: 235, name: 'Palmas de San Alberto', nit: '900.207.912-7', type: 'Otro' },
    { id: 246, name: 'Voltaje Empresarial', nit: '900.654.403-6', type: 'Otro' },
    { id: 258, name: 'Agroingenium', nit: '901.203.079-1', type: 'Otro' },
    { id: 2, name: 'Zona Franca Las Américas', nit: '900.162.578-4', type: 'Otro' },
    { id: 11, name: 'Carmen Abondano De Dávila', nit: 'Persona Natural', type: 'PN' },
    { id: 12, name: 'Otros accionistas', nit: 'Minoritarios', type: 'Otro' },
    { id: 20, name: 'Zona Franca Tayrona', nit: '900.166.187-6', type: 'Otro' },
    { id: 32, name: 'Inversiones Solano Dávila & CIA SAS', nit: '819.004.204-5', type: 'SAS' },
    { id: 33, name: 'Zapata Solano e Hijos SCA', nit: '830.506.310-2', type: 'SCA' },
    { id: 67, name: 'Julio Mauricio Alcibiades González Acosta', nit: 'Persona Natural', type: 'PN' },
    { id: 84, name: 'Caribbean Eco Soap', nit: '900.324.176-3', type: 'Otro' },
    { id: 85, name: 'Cacata Investments Inc.', nit: '19567', type: 'SA' },
    { id: 91, name: 'Global Organic IN', nit: '359260', type: 'Otro' },
    { id: 92, name: 'South Bay Corporation', nit: 'RUC: 57672-1-372127 D.V 60', type: 'SA' },
    { id: 95, name: 'Palma y Trabajo', nit: '900.702.560-0', type: 'Otro' },
    { id: 96, name: 'Inverfranca Management SA', nit: '18098411707043 DV85', type: 'SA' },
    { id: 99, name: 'Terminal de Graneles Líquidos del Caribe SAS', nit: '819.002.433-6', type: 'SAS' },
    { id: 100, name: 'Puerto de las Américas Holding SAS', nit: '900.763.043-5', type: 'SAS' },
    { id: 105, name: 'Trading Services UC SAS', nit: '900.408.314-5', type: 'SAS' },
    { id: 106, name: 'We Bay', nit: '635,182', type: 'Otro' },
    { id: 7, name: 'Oleaginosas las Brisas', nit: '890.901.733-6', type: 'SAS' },
    { id: 15, name: 'Oleaginosas del Yuma', nit: '900.769.574-1', type: 'SAS' },
    { id: 17, name: 'INVERFRANCA MANAGEMENT S.A.', nit: '', type: 'SA' },
  ],
  edges: [
    { from: 46, to: 51, weight: null },
    { from: 47, to: 50, weight: null },
    { from: 49, to: 92, weight: null },
    { from: 48, to: 51, weight: null },
    { from: 222, to: 53, weight: '93,75' },
    { from: 48, to: 235, weight: '20' },
    { from: 46, to: 111, weight: null },
    { from: 51, to: 52, weight: '60,57' },
    { from: 51, to: 136, weight: '20' },
    { from: 52, to: 136, weight: '44,17' },
    { from: 53, to: 136, weight: null },
    { from: 153, to: 136, weight: '8,55' },
    { from: 154, to: 53, weight: '0,02' },
    { from: 155, to: 53, weight: '0,01' },
    { from: 52, to: 188, weight: '99,76' },
    { from: 153, to: 188, weight: null },
    { from: 213, to: 188, weight: '17,79' },
    { from: 52, to: 222, weight: '14,187' },
    { from: 53, to: 222, weight: '1,25' },
    { from: 227, to: 222, weight: '16,67' },
    { from: 52, to: 246, weight: '100' },
    { from: 53, to: 188, weight: '0,08' },
    { from: 235, to: 258, weight: '100' },
    { from: 136, to: 2, weight: '41,189' },
    { from: 235, to: 2, weight: '4,18' },
    { from: 2, to: 20, weight: '19,88' },
    { from: 11, to: 2, weight: '17,234' },
    { from: 12, to: 2, weight: '0,388' },
    { from: 32, to: 20, weight: '20,69' },
    { from: 67, to: 20, weight: '2' },
    { from: 33, to: 20, weight: '8,44' },
    { from: 227, to: 20, weight: '49' },
    { from: 85, to: 84, weight: '100' },
    { from: 92, to: 91, weight: null },
    { from: 96, to: 95, weight: '100' },
    { from: 100, to: 99, weight: '100' },
    { from: 106, to: 105, weight: null },
    { from: 111, to: 7, weight: null },
    { from: 111, to: 235, weight: '100' },
    { from: 17, to: 15, weight: '100' },
  ],
}

export const TYPE_META: Record<EntityType, { label: string; short: string; color: string; description: string }> = {
  SAS: { label: 'Sociedad por Acciones Simplificada', short: 'SAS', color: '#3E5C7A', description: 'Régimen societario simplificado (Ley 1258/2008).' },
  SCA: { label: 'Sociedad en Comandita por Acciones', short: 'SCA', color: '#7A3B5B', description: 'Sociedad mixta con gestores y comanditarios.' },
  SA:  { label: 'Sociedad Anónima', short: 'SA', color: '#B08D3F', description: 'Sociedad anónima o su equivalente extranjero.' },
  PN:  { label: 'Persona Natural', short: 'PN', color: '#A34B33', description: 'Accionista persona natural.' },
  Otro:{ label: 'Otra figura', short: 'Otro', color: '#6B6560', description: 'Estructura no clasificada en los tipos anteriores.' },
}
