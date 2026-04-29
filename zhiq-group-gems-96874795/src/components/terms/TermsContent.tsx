import { PROFILE_TYPES, ProfileType } from '@/lib/profileTypes';

interface TermsContentProps {
  profileType?: ProfileType | string;
  showAll?: boolean;
}

const COMMON_CLAUSE = `
## Regra Fundamental

**Nenhum serviço (corrida ou entrega) é iniciado sem o aceite consciente e voluntário do prestador de serviços, realizado por meio do aplicativo.**

Sem aceite:
- Não há serviço
- Não há obrigação
- Não há pagamento

A plataforma atua exclusivamente como **intermediadora tecnológica**, conectando usuários que desejam solicitar ou prestar serviços. Não há vínculo empregatício entre a plataforma e os prestadores.
`;

const COMMUNITY_CLAUSE = `
## Comunidade e Crescimento

A plataforma prioriza o **crescimento orgânico e comunitário**, reduzindo a dependência de anúncios pagos. Cada usuário é parte essencial do ecossistema.

### Grupos de WhatsApp e Incentivos

- Os grupos de WhatsApp fazem parte da lógica de incentivos do aplicativo
- Manter grupos **ativos e válidos** pode resultar em **redução de comissão** e outros benefícios
- Grupos **inativos, inválidos ou abandonados** podem resultar em **perda de benefícios**
- As regras de comissão são transparentes e sempre exibidas no aplicativo

### Seu Papel no Ecossistema

O sucesso da plataforma depende da colaboração ativa de todos:
- **Passageiros** que utilizam o serviço de forma responsável
- **Motoristas e Motoboys** que prestam serviços com qualidade
- **Lojistas** que confiam na plataforma para suas entregas
`;

const PASSENGER_TERMS = `
## Termos do Passageiro

Ao utilizar a plataforma como passageiro, você declara que:

### Solicitação de Corridas
- Solicita corridas **por conta própria** e de forma voluntária
- Escolhe **conscientemente** o tipo de transporte (carro ou moto)
- Entende que corrida de moto envolve **garupa**
- Compreende que **não existe código de confirmação** em corridas (diferente de entregas)

### Suas Responsabilidades
- Fornecer informações **verdadeiras** sobre origem e destino
- **Respeitar** o prestador de serviços durante toda a corrida
- Estar no local combinado no horário acordado

### Condições do Serviço
- A plataforma **não garante disponibilidade imediata** de prestadores
- O serviço **só inicia após o aceite** voluntário de um motorista ou motoboy
- Você pode cancelar a solicitação a qualquer momento antes do início da corrida
`;

const DRIVER_TERMS = `
## Termos do Motorista

Ao utilizar a plataforma como motorista, você declara que:

### Sua Atuação
- Atua como **prestador de serviços independente**
- Decide **livremente** quando ficar online
- Pode **aceitar, reservar ou recusar** qualquer chamada
- Não possui **exclusividade** com a plataforma

### Serviços que Pode Prestar
- **Transporte de passageiros** (corridas)
- **Entrega de mercadorias** (deliveries)

### Condições Importantes
- **Não existe vínculo empregatício** com a plataforma
- **Não há garantia de ganhos** mínimos
- Pagamentos só ocorrem **após conclusão válida** do serviço
- **Entregas exigem código de confirmação** do destinatário

### Suas Responsabilidades
- Manter veículo em **condições adequadas**
- Possuir **documentação regular** (CNH, licenciamento, seguro)
- Prestar o serviço com **respeito e profissionalismo**
`;

const MOTOBOY_TERMS = `
## Termos do Motoboy

Ao utilizar a plataforma como motoboy, você declara que:

### Sua Atuação
- Atua como **prestador autônomo**
- Decide **livremente** quando e como trabalhar
- Não possui **vínculo empregatício** com a plataforma

### Serviços Disponíveis
- **Entregas de mercadorias** (padrão)
- **Transporte de passageiros (garupa)** - apenas se optar por ativar

### Transporte de Passageiros
- O transporte de passageiros é **totalmente opcional**
- Você só receberá corridas de garupa se **ativar essa opção** no aplicativo
- Pode desativar a qualquer momento

### Regras Operacionais
- **Não é possível** realizar corrida e entrega simultaneamente
- **Entregas exigem código de confirmação** do destinatário
- Corridas de passageiro **não utilizam código**

### Suas Responsabilidades
- Garantir **condições adequadas** do veículo
- Fornecer **equipamentos de segurança** (capacete extra para passageiro)
- Manter **documentação regular** (CNH categoria A, licenciamento)
`;

const MOTOBOY_INCENTIVE_TERMS = `
## Termos de Incentivo por Grupos e Comissão da Plataforma – Motoboy

### 1. Objeto
Este termo regula as condições de uso da plataforma Viagg-TX8 pelo Motoboy, especificamente quanto à adição e manutenção de grupos de WhatsApp e à aplicação das porcentagens de comissão da plataforma sobre as entregas realizadas.

### 2. Grupos de WhatsApp
- O Motoboy poderá cadastrar grupos de WhatsApp de sua **titularidade ou administração**, com a finalidade de divulgação da plataforma Viagg-TX8.
- Somente serão considerados grupos válidos aqueles que estiverem: **ativos**, **aprovados pela plataforma** e em **conformidade com as políticas internas**.
- Grupos **inativos, removidos, inválidos ou que violem políticas** não serão contabilizados para fins de incentivo.

### 3. Comissão da Plataforma (Taxa Viagg-TX8)
- A Viagg-TX8 aplica uma **taxa de comissão sobre o valor bruto** de cada entrega realizada pelo Motoboy.
- Essa taxa é **descontada automaticamente**, resultando no valor líquido recebido pelo Motoboy.

### 4. Comissão Dinâmica por Quantidade de Grupos
A porcentagem da comissão varia conforme a quantidade de grupos ativos mantidos pelo Motoboy:

| Grupos Ativos | Comissão da Plataforma |
|---------------|------------------------|
| 0             | 25%                    |
| 1             | 22%                    |
| 2             | 18%                    |
| 3             | 15%                    |
| 4             | 11%                    |
| 5             | 8%                     |
| 6 ou mais     | 6%                     |

- Ao atingir **6 (seis) ou mais grupos ativos**, o Motoboy passa a ter direito à **taxa mínima de 6%**.

### 5. Regra de Aplicação
- A taxa aplicável é calculada **no momento do aceite** da entrega.
- A comissão definida fica **travada para aquela entrega**, não sendo alterada posteriormente.
- Alterações na quantidade de grupos impactam **apenas entregas futuras**.

### 6. Transparência
O Motoboy terá acesso, no painel, às seguintes informações:
- **Quantidade de grupos ativos**
- **Percentual atual da comissão**
- **Valor bruto, taxa e valor líquido** por entrega

### 7. Penalidades e Ajustes
A Viagg-TX8 poderá:
- Desconsiderar grupos inválidos
- Ajustar a comissão automaticamente conforme a quantidade real de grupos ativos
- Atualizar estas regras mediante **aviso prévio no painel**

### 8. Aceitação
- Ao utilizar a plataforma, o Motoboy declara **ciência e concordância** com os termos acima.
- O uso contínuo da plataforma implica **aceitação integral** deste termo.
`;

const MERCHANT_TERMS = `
## Termos do Lojista

Ao utilizar a plataforma como lojista, você declara que:

### Uso da Plataforma
- Utiliza a plataforma para **divulgar produtos**
- Solicita entregas através do aplicativo
- Reconhece que a plataforma **não é responsável** pelos produtos vendidos

### Condições das Entregas
- A entrega só ocorre **após aceite** de um prestador
- A plataforma não controla a qualidade ou integridade dos produtos
- Você é responsável pela **embalagem adequada** dos itens

### Comissão e Pagamentos
- Concorda com o **desconto automático** de comissão por pedido
- Entende que a **comissão pode variar** conforme metas de grupos
- Pagamentos só são repassados **após entrega confirmada** (código validado)

### Grupos e Benefícios
- Manter grupos de WhatsApp ativos pode **reduzir sua comissão**
- Grupos inativos podem resultar em **aumento da taxa**
`;

export function TermsContent({ profileType, showAll = false }: TermsContentProps) {
  const getTermsForProfile = (profile: string) => {
    switch (profile) {
      case 'passenger':
        return PASSENGER_TERMS;
      case 'driver':
        return DRIVER_TERMS;
      case 'motoboy':
        return MOTOBOY_TERMS + MOTOBOY_INCENTIVE_TERMS;
      case 'merchant':
        return MERCHANT_TERMS;
      default:
        return '';
    }
  };

  const renderMarkdown = (content: string) => {
    return content.split('\n').map((line, index) => {
      if (line.startsWith('## ')) {
        return <h2 key={index} className="text-xl font-bold mt-6 mb-3 text-foreground">{line.replace('## ', '')}</h2>;
      }
      if (line.startsWith('### ')) {
        return <h3 key={index} className="text-lg font-semibold mt-4 mb-2 text-foreground">{line.replace('### ', '')}</h3>;
      }
      if (line.startsWith('- ')) {
        const content = line.replace('- ', '');
        return (
          <li key={index} className="ml-4 text-muted-foreground">
            {content.split('**').map((part, i) => 
              i % 2 === 1 ? <strong key={i} className="text-foreground">{part}</strong> : part
            )}
          </li>
        );
      }
      if (line.startsWith('**') && line.endsWith('**')) {
        return <p key={index} className="font-semibold text-foreground my-2">{line.replace(/\*\*/g, '')}</p>;
      }
      if (line.trim() === '') {
        return <br key={index} />;
      }
      return (
        <p key={index} className="text-muted-foreground">
          {line.split('**').map((part, i) => 
            i % 2 === 1 ? <strong key={i} className="text-foreground">{part}</strong> : part
          )}
        </p>
      );
    });
  };

  if (showAll) {
    return (
      <div className="space-y-6 text-sm">
        <h1 className="text-2xl font-bold text-foreground">Termos de Uso</h1>
        <p className="text-muted-foreground">
          Última atualização: {new Date().toLocaleDateString('pt-BR')}
        </p>
        {renderMarkdown(COMMON_CLAUSE)}
        {renderMarkdown(COMMUNITY_CLAUSE)}
        {renderMarkdown(PASSENGER_TERMS)}
        {renderMarkdown(DRIVER_TERMS)}
        {renderMarkdown(MOTOBOY_TERMS)}
        {renderMarkdown(MOTOBOY_INCENTIVE_TERMS)}
        {renderMarkdown(MERCHANT_TERMS)}
      </div>
    );
  }

  const profileConfig = profileType ? PROFILE_TYPES[profileType] : null;
  const specificTerms = profileType ? getTermsForProfile(profileType) : '';

  return (
    <div className="space-y-4 text-sm">
      <h1 className="text-2xl font-bold text-foreground">
        Termos de Uso {profileConfig ? `- ${profileConfig.label}` : ''}
      </h1>
      <p className="text-muted-foreground">
        Última atualização: {new Date().toLocaleDateString('pt-BR')}
      </p>
      {renderMarkdown(COMMON_CLAUSE)}
      {renderMarkdown(COMMUNITY_CLAUSE)}
      {specificTerms && renderMarkdown(specificTerms)}
    </div>
  );
}
