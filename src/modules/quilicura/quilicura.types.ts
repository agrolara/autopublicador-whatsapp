export interface CategoriaAlerta {
  nombre: string;
  urgencia: 'critica' | 'alta' | 'media' | 'baja';
  despachoInmediato: boolean;
  palabrasClave: string[];
}

export interface ReglasAlertasConfig {
  sensibilidadJev: number;
  notificarPorWhatsApp: boolean;
  categorias: {
    ilicito: CategoriaAlerta;
    consumo_sustancias: CategoriaAlerta;
    microbasural: CategoriaAlerta;
    ruidos: CategoriaAlerta;
    [key: string]: CategoriaAlerta;
  };
}

export interface DelegarGruposPayload {
  categoria: string;
  grupos: Array<{ id: string; name: string }>;
}

export const REGLAS_ALERTAS_DEFAULT: ReglasAlertasConfig = {
  sensibilidadJev: 0.45,
  notificarPorWhatsApp: true,
  categorias: {
    ilicito: {
      nombre: '🚨 Ilícitos & Delitos Flagrantes',
      urgencia: 'critica',
      despachoInmediato: true,
      palabrasClave: [
        'encerrona',
        'portonazo',
        'asalto',
        'robo',
        'pistola',
        'arma',
        'cuchillo',
        'lanzazo',
        'chapa',
        'reventaron',
      ],
    },
    consumo_sustancias: {
      nombre: '🍺 Consumo de Sustancias & Merodeo',
      urgencia: 'media',
      despachoInmediato: true,
      palabrasClave: [
        'copete',
        'marihuana',
        'pito',
        'droga',
        'tomando en la plaza',
        'auto sospechoso',
        'mirando casas',
        'sin patente',
      ],
    },
    microbasural: {
      nombre: '🗑️ Microbasurales & Escombros',
      urgencia: 'media',
      despachoInmediato: false,
      palabrasClave: [
        'escombros',
        'botando basura',
        'vertedero',
        'colchones',
        'cachureos',
        'quebrada',
        'camion botando',
      ],
    },
    ruidos: {
      nombre: '🔊 Ruidos Molestos & Piques',
      urgencia: 'media',
      despachoInmediato: false,
      palabrasClave: [
        'piques',
        'carreras clandestinas',
        'musica fuerte',
        'parlantes',
        'fiesta clandestina',
      ],
    },
  },
};
