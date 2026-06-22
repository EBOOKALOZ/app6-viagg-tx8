import { useState } from 'react';
import { chatCompletionDirect } from '@/lib/aiapi-direct';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Loader2 } from 'lucide-react';

export default function TestAI() {
  const [input, setInput] = useState('');
  const [modelo, setModelo] = useState('claude-3-5-sonnet-20240620');
  const [resposta, setResposta] = useState('');
  const [carregando, setCarregando] = useState(false);
  const [erro, setErro] = useState('');

  const enviarParaIA = async () => {
    if (!input.trim()) return;
    
    setCarregando(true);
    setErro('');
    setResposta('');

    try {
      const resp = await chatCompletionDirect(
        input,
        modelo,
        'Você é um assistente prestativo. Responda de forma clara e amigável em português.'
      );
      setResposta(resp);
    } catch (err: any) {
      setErro(err.message || 'Erro ao chamar a IA');
    } finally {
      setCarregando(false);
    }
  };

  return (
    <div className="flex justify-center items-center min-h-screen bg-gray-50 p-4">
      <Card className="w-full max-w-2xl">
        <CardHeader>
          <CardTitle>Teste de Inteligência Artificial</CardTitle>
          <CardDescription>
            Envie uma mensagem para a AIAPI.world usando a chave do seu .env.local
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex gap-2">
            <Input 
              value={modelo} 
              onChange={(e) => setModelo(e.target.value)}
              placeholder="Nome do modelo (ex: gpt-4o, claude-3-opus-20240229, glm-4)" 
              className="w-1/3"
            />
          </div>
          <div className="flex gap-2">
            <Input 
              value={input} 
              onChange={(e) => setInput(e.target.value)}
              placeholder="Digite sua pergunta aqui..." 
              onKeyDown={(e) => e.key === 'Enter' && enviarParaIA()}
            />
            <Button onClick={enviarParaIA} disabled={carregando || !input.trim()}>
              {carregando ? <Loader2 className="animate-spin" /> : 'Enviar'}
            </Button>
          </div>

          {erro && (
            <div className="p-3 bg-red-100 text-red-700 rounded-md text-sm">
              {erro}
            </div>
          )}

          {resposta && (
            <div className="p-4 bg-blue-50 border border-blue-100 rounded-md">
              <h3 className="font-semibold text-blue-900 mb-2">Resposta da IA:</h3>
              <p className="whitespace-pre-wrap text-gray-800">{resposta}</p>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
