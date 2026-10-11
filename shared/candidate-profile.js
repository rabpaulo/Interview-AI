export const EXPERIENCE_FIELDS = [
  { key: 'project', label: 'Qual projeto ou situação?', placeholder: 'Empresa, projeto ou atividade de estudo.' },
  { key: 'challenge', label: 'Qual era o problema?', placeholder: 'O que precisava melhorar? Qual era a dificuldade?' },
  { key: 'action', label: 'O que você fez e por quê?', placeholder: 'Sua participação, decisões e alternativas que considerou.' },
  { key: 'result', label: 'O que aconteceu depois?', placeholder: 'Resultado observado. Use números apenas se souber.' },
  { key: 'learning', label: 'O que você aprendeu?', placeholder: 'O que faria novamente ou mudaria em outra situação.' },
];

export const INTERVIEW_FIELDS = [
  { key: 'role', label: 'Empresa e vaga', placeholder: 'Nome da empresa, cargo e nível, se conhecidos.' },
  { key: 'requirements', label: 'O que a vaga pede?', placeholder: 'Requisitos e desafios descritos na vaga ou pelo recrutador.' },
  { key: 'motivation', label: 'O que te interessa nessa oportunidade?', placeholder: 'Seus motivos reais e o que procura no próximo trabalho.' },
];

function section(title, fields, values) {
  const answers = fields.flatMap(({ key, label }) => {
    const value = typeof values[key] === 'string' ? values[key].trim() : '';
    return value ? [`${label}\n${value}`] : [];
  });
  return answers.length ? `## ${title}\n${answers.join('\n\n')}` : '';
}

export function composeCandidateContext(context = '', experience = {}, interview = {}) {
  return [context.trim(), section('Experiência real', EXPERIENCE_FIELDS, experience),
    section('Entrevista atual', INTERVIEW_FIELDS, interview)].filter(Boolean).join('\n\n');
}
