import { supabase } from '../lib/supabaseClient.js';

/**
 * Modelos de checklist de FAT (teste de aceitação na fábrica) e SAT (no
 * cliente) para máquinas/células robotizadas. Ponto de partida editável:
 * o Diego pode incluir/excluir itens em cada projeto.
 */
export const MODELO_CHECKLIST = {
  fat: [
    ['Documentação', [
      'Diagramas elétricos atualizados (as built)',
      'Desenhos mecânicos / layout conferidos',
      'Lista de materiais e certificados de componentes',
      'Backup do programa do CLP, robô e IHM'
    ]],
    ['Segurança (NR-12)', [
      'Botões de emergência atuando e rearme manual',
      'Portas e proteções com intertravamento de segurança',
      'Cortina/scanner de luz parando o movimento',
      'Relé/CLP de segurança validado (teste de falhas)',
      'Sinalização e etiquetas de segurança'
    ]],
    ['Mecânica', [
      'Montagem, fixações e acabamento',
      'Alinhamento e folgas',
      'Pneumática: vazamentos e regulagens',
      'Lubrificação e itens de manutenção acessíveis'
    ]],
    ['Elétrica', [
      'Painel: identificação de cabos e bornes',
      'Aterramento e continuidade',
      'Proteções (disjuntores, fusíveis) dimensionadas',
      'Teste de I/O ponto a ponto'
    ]],
    ['Automação / IHM / Robô', [
      'Modos manual e automático',
      'Telas da IHM, alarmes e mensagens',
      'Receitas / parâmetros de produto',
      'Trajetórias do robô e zonas de interferência',
      'Recuperação após falha / falta de energia'
    ]],
    ['Ciclo e desempenho', [
      'Tempo de ciclo atingido',
      'Rodada de produção sem falhas (amostra combinada)',
      'Qualidade das peças conforme especificação'
    ]]
  ],
  sat: [
    ['Instalação', [
      'Nivelamento e fixação no piso',
      'Ligação elétrica e pneumática na planta',
      'Distâncias de segurança e acessos'
    ]],
    ['Segurança (NR-12)', [
      'Emergências e intertravamentos reconferidos no local',
      'Integração da segurança com a linha do cliente'
    ]],
    ['Integração', [
      'Comunicação com a linha / supervisório do cliente',
      'Sinais de handshake com equipamentos vizinhos'
    ]],
    ['Produção assistida', [
      'Tempo de ciclo na linha do cliente',
      'Rodada de produção acompanhada',
      'Qualidade aprovada pelo cliente'
    ]],
    ['Entrega', [
      'Treinamento de operação realizado',
      'Treinamento de manutenção realizado',
      'Documentação final entregue (manual, diagramas, backups)',
      'Pendências registradas e prazo combinado'
    ]]
  ]
};

export const RESULTADOS = [
  { value: 'ok', label: 'OK', color: '#15803d' },
  { value: 'nok', label: 'Não OK', color: '#dc2626' },
  { value: 'na', label: 'N/A', color: '#64748b' }
];

export const PARECERES = [
  { value: 'aprovado', label: 'Aprovado' },
  { value: 'aprovado_ressalvas', label: 'Aprovado com ressalvas' },
  { value: 'reprovado', label: 'Reprovado' }
];

export async function listChecklist(projectId, tipo) {
  const { data, error } = await supabase
    .from('checklist_itens')
    .select('*')
    .eq('project_id', projectId)
    .eq('tipo', tipo)
    .order('ordem', { ascending: true });
  if (error) throw error;
  return data;
}

export async function criarChecklistDoModelo(projectId, tipo) {
  let ordem = 0;
  const rows = [];
  for (const [grupo, itens] of MODELO_CHECKLIST[tipo]) {
    for (const item of itens) rows.push({ project_id: projectId, tipo, grupo, item, ordem: (ordem += 10) });
  }
  const { error } = await supabase.from('checklist_itens').insert(rows);
  if (error) throw error;
}

export async function addItem(projectId, tipo, grupo, item, ordem) {
  const { data, error } = await supabase
    .from('checklist_itens')
    .insert({ project_id: projectId, tipo, grupo, item, ordem })
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function updateItem(id, fields) {
  const { data, error } = await supabase.from('checklist_itens').update(fields).eq('id', id).select().single();
  if (error) throw error;
  return data;
}

export async function deleteItem(id) {
  const { error } = await supabase.from('checklist_itens').delete().eq('id', id);
  if (error) throw error;
}

export async function getAta(projectId, tipo) {
  const { data, error } = await supabase
    .from('checklist_atas')
    .select('*')
    .eq('project_id', projectId)
    .eq('tipo', tipo)
    .maybeSingle();
  if (error) throw error;
  return data;
}

export async function saveAta(projectId, tipo, fields) {
  const { data, error } = await supabase
    .from('checklist_atas')
    .upsert({ project_id: projectId, tipo, ...fields, updated_at: new Date().toISOString() }, { onConflict: 'project_id,tipo' })
    .select()
    .single();
  if (error) throw error;
  return data;
}

/** Agrupa mantendo a ordem dos itens. */
export function agrupar(itens) {
  const grupos = [];
  const idx = {};
  for (const it of itens) {
    if (!(it.grupo in idx)) {
      idx[it.grupo] = grupos.length;
      grupos.push({ grupo: it.grupo, itens: [] });
    }
    grupos[idx[it.grupo]].itens.push(it);
  }
  return grupos;
}

export function progresso(itens) {
  const r = { total: itens.length, ok: 0, nok: 0, na: 0, pendente: 0 };
  for (const it of itens) r[it.resultado] = (r[it.resultado] || 0) + 1;
  return r;
}
