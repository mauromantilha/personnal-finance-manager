import React, { useState } from 'react';
import { Shield, CheckCircle2, AlertTriangle, Lock, Database, Zap } from 'lucide-react';

interface Props {
  onAccept: () => void;
}

function SectionHeader({ num, title, icon: Icon, color }: {
  num: string; title: string;
  icon: React.ElementType;
  color: 'amber' | 'indigo' | 'emerald' | 'slate';
}) {
  const colors = {
    amber:   'bg-amber-500/10  border-amber-500/25  text-amber-400',
    indigo:  'bg-indigo-500/10 border-indigo-500/25 text-indigo-400',
    emerald: 'bg-emerald-500/10 border-emerald-500/25 text-emerald-400',
    slate:   'bg-slate-700/50  border-slate-600/50   text-slate-300',
  };
  return (
    <div className={`flex items-center gap-3 rounded-xl border px-4 py-3 ${colors[color]}`}>
      <Icon className="w-4 h-4 shrink-0" />
      <p className="font-bold text-sm">
        <span className="opacity-60 mr-1.5">{num}.</span>{title}
      </p>
    </div>
  );
}

function SubItem({ num, children }: { num: string; children: React.ReactNode }) {
  return (
    <div className="pl-4 border-l-2 border-slate-700 space-y-0.5">
      <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide">{num}</p>
      <p className="text-sm text-slate-300 leading-relaxed">{children}</p>
    </div>
  );
}

export function LGPDModal({ onAccept }: Props) {
  const [checked, setChecked] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error,   setError]   = useState('');

  async function handleAccept() {
    if (!checked || loading) return;
    setLoading(true);
    setError('');
    try {
      const r = await fetch('/api/lgpd/accept', { method: 'POST' });
      if (!r.ok) throw new Error('Erro ao registrar aceite.');
      onAccept();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/97 backdrop-blur-sm p-4">
      <div className="bg-slate-900 border border-slate-700 rounded-2xl shadow-2xl w-full max-w-2xl flex flex-col max-h-[92vh]">

        {/* Header */}
        <div className="flex items-center gap-3 px-6 py-5 border-b border-slate-800 shrink-0">
          <div className="w-10 h-10 bg-indigo-600/20 rounded-xl flex items-center justify-center shrink-0">
            <Shield className="w-5 h-5 text-indigo-400" />
          </div>
          <div>
            <h2 className="font-bold text-white text-base leading-tight">
              Termos de Uso e Acordo de Processamento de Dados
            </h2>
            <p className="text-xs text-slate-400 mt-0.5">
              Finanças Livre · Versão 2.0 · Vigente desde 26/05/2026
            </p>
          </div>
        </div>

        {/* Scrollable body */}
        <div className="overflow-y-auto px-6 py-5 space-y-5 text-sm [scrollbar-width:thin] [scrollbar-color:theme(colors.slate.700)_transparent]">

          <p className="text-slate-400 text-xs leading-relaxed">
            Ao acessar e utilizar esta plataforma de gestão financeira e inteligência artificial
            (<strong className="text-slate-300">"Plataforma"</strong>), o Usuário declara ter lido,
            compreendido e concordado expressamente com as regras e responsabilidades descritas
            neste documento.
          </p>

          {/* ── Seção 1 ── */}
          <div className="space-y-3">
            <SectionHeader num="1" title="Natureza do Serviço e Limitação de Responsabilidade da IA" icon={AlertTriangle} color="amber" />
            <SubItem num="1.1 — Ferramenta de Apoio">
              A Plataforma é fornecida de forma gratuita como uma ferramenta de apoio à gestão de
              clientes e análise financeira.{' '}
              <strong className="text-white">O sistema não substitui o julgamento profissional,
              a análise técnica ou a certificação do Usuário.</strong>
            </SubItem>
            <SubItem num="1.2 — Hipóteses Algorítmicas">
              As sugestões de negociação de dívidas, estruturação de pagamentos e análises de risco
              geradas pela Inteligência Artificial são{' '}
              <strong className="text-amber-300">hipóteses algorítmicas</strong>. A Plataforma não
              garante a precisão matemática absoluta, o sucesso de acordos junto a credores ou a
              viabilidade jurídica das sugestões geradas.
            </SubItem>
            <SubItem num="1.3 — Responsabilidade Exclusiva">
              O Usuário é o{' '}
              <strong className="text-white">único e exclusivo responsável</strong> por validar,
              revisar e aprovar qualquer sugestão gerada pela IA antes de apresentá-la ao seu cliente
              final. A Plataforma exime-se de qualquer responsabilidade civil, material ou moral
              decorrente de prejuízos financeiros, negativações indevidas ou acordos desfavoráveis
              originados pela aplicação não supervisionada das sugestões do sistema.
            </SubItem>
          </div>

          {/* ── Seção 2 ── */}
          <div className="space-y-3">
            <SectionHeader num="2" title="Proteção de Dados (LGPD) e Papéis Legais" icon={Shield} color="indigo" />
            <SubItem num="2.1 — Controlador e Operador">
              Para os fins da Lei Geral de Proteção de Dados (<strong className="text-white">Lei nº 13.709/2018</strong>),
              fica estipulado que o Usuário atua como{' '}
              <strong className="text-indigo-300">Controlador</strong> dos dados de seus clientes
              finais, enquanto a Plataforma atua estritamente como{' '}
              <strong className="text-indigo-300">Operadora</strong>.
            </SubItem>
            <SubItem num="2.2 — Dever de Consentimento">
              É obrigação integral do Usuário obter o{' '}
              <strong className="text-white">consentimento explícito</strong>, ou estabelecer outra
              base legal válida, junto ao seu cliente final para a inserção e o processamento de seus
              dados financeiros e pessoais em sistemas de Inteligência Artificial de terceiros.
            </SubItem>
            <SubItem num="2.3 — Sanitização Recomendada">
              A Plataforma recomenda e encoraja que o Usuário insira os dados do cliente final de
              forma <strong className="text-white">pseudonimizada</strong> (ex: utilizando iniciais
              ou códigos internos) no momento de gerar análises via IA, minimizando o tráfego de
              Dados Pessoais Identificáveis (PII).
            </SubItem>
          </div>

          {/* ── Seção 3 ── */}
          <div className="space-y-3">
            <SectionHeader num="3" title="Arquitetura de Segurança, Isolamento e Autenticação" icon={Lock} color="emerald" />
            <SubItem num="3.1 — Isolamento de Infraestrutura">
              A Plataforma utiliza arquitetura de{' '}
              <strong className="text-white">isolamento rigoroso</strong>. Os dados inseridos pelo
              Usuário são armazenados em um banco de dados exclusivo (Silo/Tenant), garantindo que
              não haja compartilhamento de infraestrutura de dados primários com outros consultores.
            </SubItem>
            <SubItem num="3.2 — Autenticação Zero Trust">
              O acesso à Plataforma dispensa o uso de senhas estáticas, operando sob o modelo{' '}
              <strong className="text-white">Zero Trust</strong> mediante o envio de códigos de uso
              único (OTP) para o e-mail cadastrado.
            </SubItem>
            <SubItem num="3.3 — Sigilo de Credenciais">
              O Usuário é integralmente responsável por manter a segurança e o controle absoluto
              sobre a caixa de entrada do e-mail fornecido. Qualquer acesso validado pelo código OTP
              enviado ao e-mail cadastrado será considerado{' '}
              <strong className="text-white">legítimo e de inteira responsabilidade do Usuário</strong>.
            </SubItem>
          </div>

          {/* ── Seção 4 ── */}
          <div className="space-y-3">
            <SectionHeader num="4" title="Retenção, Minimização de Dados e Exclusão Irreversível" icon={Database} color="slate" />
            <SubItem num="4.1 — Uso do CPF">
              O CPF do Usuário é coletado exclusivamente no momento do cadastro para fins de
              prevenção a fraudes e garantia de unicidade da conta. O CPF{' '}
              <strong className="text-white">não é utilizado para provisionar o ambiente de dados</strong>{' '}
              e é armazenado exclusivamente sob formato de{' '}
              <strong className="text-white">hash criptográfico unidirecional</strong> (HMAC-SHA-256
              com chave secreta).
            </SubItem>
            <SubItem num="4.2 — Encerramento e Hard Delete">
              Em caso de encerramento da conta, a Plataforma executará a{' '}
              <strong className="text-red-400">exclusão física, permanente e irreversível
              (Hard Delete)</strong> de todo o banco de dados exclusivo e dos arquivos de
              armazenamento atrelados àquele Tenant.{' '}
              <strong className="text-white">Não haverá possibilidade de recuperação de dados
              após a exclusão.</strong>
            </SubItem>
          </div>

          {/* ── Seção 5 ── */}
          <div className="space-y-3">
            <SectionHeader num="5" title="Gratuidade, Disponibilidade e Prevenção a Abusos" icon={Zap} color="slate" />
            <SubItem num="5.1 — Serviço &quot;As Is&quot;">
              Por se tratar de uma ferramenta gratuita de impacto social, a Plataforma é fornecida{' '}
              <strong className="text-white">"no estado em que se encontra" (as is)</strong>. Não há
              garantias de SLA para uptime, tempo de resposta da IA ou retenção de longo prazo. A
              Plataforma reserva-se o direito de limitar recursos, suspender ou descontinuar a
              ferramenta a qualquer momento, mediante aviso prévio razoável.
            </SubItem>
            <SubItem num="5.2 — Uso Aceitável e Anti-Bot">
              A Plataforma utiliza sistemas de validação de tráfego humano. Qualquer tentativa de
              burlar essas validações, aplicar engenharia reversa, realizar extração automatizada de
              dados (scraping), ou utilizar scripts para sobrecarregar a infraestrutura resultará no{' '}
              <strong className="text-red-400">banimento imediato e irreversível do Usuário</strong>,
              além de potenciais medidas legais.
            </SubItem>
          </div>

          <p className="text-xs text-slate-500 italic leading-relaxed pt-1">
            O aceite é registrado com data, hora e IP de acesso como prova de conformidade com a
            LGPD (Lei nº 13.709/2018), Art. 7º e Art. 8º.
          </p>
        </div>

        {/* Footer */}
        <div className="px-6 py-5 border-t border-slate-800 shrink-0 space-y-4">

          <label className="flex items-start gap-3 cursor-pointer group">
            <div className="relative mt-0.5 shrink-0">
              <input
                type="checkbox"
                checked={checked}
                onChange={e => setChecked(e.target.checked)}
                className="sr-only"
              />
              <div className={`w-5 h-5 rounded border-2 flex items-center justify-center transition-colors
                ${checked
                  ? 'bg-indigo-600 border-indigo-600'
                  : 'bg-slate-800 border-slate-600 group-hover:border-indigo-500'}`}>
                {checked && <CheckCircle2 className="w-3.5 h-3.5 text-white" />}
              </div>
            </div>
            <span className="text-sm text-slate-300 leading-snug">
              ☑️ Declaro que li, compreendi e aceito integralmente os{' '}
              <strong className="text-white">Termos de Uso e a Política de Privacidade</strong>{' '}
              descritos acima, assumindo a responsabilidade pela validação humana das decisões da
              Inteligência Artificial e pela coleta de consentimento dos meus clientes finais.
            </span>
          </label>

          {error && <p className="text-sm text-red-400">{error}</p>}

          <button
            onClick={handleAccept}
            disabled={!checked || loading}
            className={`w-full py-3.5 rounded-xl font-bold text-sm transition-all
              ${checked && !loading
                ? 'bg-indigo-600 hover:bg-indigo-500 active:scale-[0.98] text-white cursor-pointer shadow-lg shadow-indigo-900/40'
                : 'bg-slate-800 text-slate-600 cursor-not-allowed'}`}
          >
            {loading ? 'Registrando aceite...' : 'Aceitar e Criar Meu Ambiente Seguro'}
          </button>
        </div>
      </div>
    </div>
  );
}
