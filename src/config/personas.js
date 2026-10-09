export const PERSONA_CATEGORIES = {
  interview: {
    id: 'interview',
    name: 'Entrevistas de Emprego',
    description: 'Copilotos especializados para cada etapa de processos seletivos e entrevistas técnicas (Perssua & Cody)',
  },
  business: {
    id: 'business',
    name: 'Negócios & Vendas',
    description: 'Assistência para apresentações de negócios, pitches e negociações',
  },
  general: {
    id: 'general',
    name: 'Reunião Geral & Conversação',
    description: 'Assistência flexível para conversas do dia a dia e reuniões gerais',
  },
};

export const AVAILABLE_PERSONAS = [
  // --- Entrevistas de Emprego (Perssua / Cody) ---
  {
    id: 'interview_coding',
    category: 'interview',
    name: 'Entrevista: LeetCode & Live Coding',
    shortName: 'LeetCode & Código',
    tag: 'Algoritmos & Big-O',
    badgeColor: 'purple',
    iconName: 'Code',
    description: 'Especialista em algoritmos, estruturas de dados, corner cases e complexidade Big-O de tempo e memória.',
    promptSummary: 'Fornece frase de abertura, lógica de solução, código limpo e análise Big-O (tempo e espaço).',
    exampleQuestion: '“Como você inverteria uma árvore binária ou resolveria a soma de dois números em O(n)?”',
  },
  {
    id: 'interview_system_design',
    category: 'interview',
    name: 'Entrevista: System Design & Arquitetura',
    shortName: 'System Design',
    tag: 'Sistemas Distribuídos',
    badgeColor: 'indigo',
    iconName: 'Network',
    description: 'Focado em escalabilidade, microsserviços, particionamento, caching (Redis), mensageria (Kafka) e trade-offs.',
    promptSummary: 'Estrutura requisitos, desenho de blocos (API Gateway, DB, Cache), capacidade e justificativa de trade-offs.',
    exampleQuestion: '“Como você desenharia o backend do Uber ou um encurtador de URLs para 100M req/dia?”',
  },
  {
    id: 'interview_behavioral',
    category: 'interview',
    name: 'Entrevista: Comportamental (Método STAR)',
    shortName: 'Comportamental (STAR)',
    tag: 'Liderança & Fit',
    badgeColor: 'amber',
    iconName: 'Users',
    description: 'Perguntas sobre situações passadas, conflitos, liderança e resolução de problemas estruturadas no padrão STAR.',
    promptSummary: 'Estrutura a resposta em Situação (S), Tarefa (T), Ação (A) e Resultado (R) de forma humana e persuasiva.',
    exampleQuestion: '“Conte-me sobre uma vez em que você discordou do seu Tech Lead ou teve que lidar com um prazo impossível.”',
  },
  {
    id: 'interview_hr',
    category: 'interview',
    name: 'Entrevista: Fit Cultural & Triagem RH',
    shortName: 'RH & Triagem',
    tag: 'Screening / Cultura',
    badgeColor: 'emerald',
    iconName: 'Briefcase',
    description: 'Perguntas iniciais de recrutadores: história profissional, motivação, pontos fortes/fracos e expectativa salarial.',
    promptSummary: 'Respostas confiantes e empáticas, destacando conquistas sem parecer decorado ou arrogante.',
    exampleQuestion: '“Por que você quer trabalhar conosco e por que está buscando uma nova oportunidade agora?”',
  },
  {
    id: 'interview_reverse',
    category: 'interview',
    name: 'Entrevista: Perguntas para o Entrevistador',
    shortName: 'Reverse Interview',
    tag: 'Final da Entrevista',
    badgeColor: 'cyan',
    iconName: 'HelpCircle',
    description: 'Perguntas estratégicas e inteligentes para você fazer ao entrevistador quando ele pergunta “Você tem alguma dúvida?”.',
    promptSummary: 'Sugere 2 a 3 perguntas profundas sobre a arquitetura da empresa, débitos técnicos, cultura e desafios.',
    exampleQuestion: '“Você tem alguma pergunta para nós sobre o time ou sobre a vaga?”',
  },

  // --- Negócios & Vendas ---
  {
    id: 'sales',
    category: 'business',
    name: 'Vendas, Pitch & Objeções',
    shortName: 'Vendas & Pitch',
    tag: 'Comercial & Objeções',
    badgeColor: 'rose',
    iconName: 'DollarSign',
    description: 'Ideal para cold calls, reuniões com clientes, contorno imediato de objeções e fechamento de acordos.',
    promptSummary: 'Abertura empática de alto impacto, contorno da objeção com valor tangível e pergunta de fechamento.',
    exampleQuestion: '“Seu produto é muito caro e o concorrente X já nos atende bem.”',
  },

  // --- Reunião Geral / Conversa Livre ---
  {
    id: 'general',
    category: 'general',
    name: 'Reunião Geral & Conversa Livre',
    shortName: 'Reunião Geral',
    tag: 'Conversacional / 1:1',
    badgeColor: 'blue',
    iconName: 'MessageSquare',
    description: 'Assistência natural para 1:1s, reuniões de alinhamento, conversas do dia a dia e bate-papo sem formato engessado.',
    promptSummary: 'Respostas contextuais, humanas e diretas prontas para falar na call sem forçar formato de entrevista.',
    exampleQuestion: '“Como estão os alinhamentos do projeto para a sprint que vem?”',
  },
];

export const DEFAULT_PERSONA = 'general';

export function getPersonaById(id) {
  // Retrocompatibilidade: 'interview' legado aponta para 'interview_coding'
  if (id === 'interview') return AVAILABLE_PERSONAS.find((p) => p.id === 'interview_coding');
  return AVAILABLE_PERSONAS.find((p) => p.id === id) || AVAILABLE_PERSONAS.find((p) => p.id === DEFAULT_PERSONA);
}
