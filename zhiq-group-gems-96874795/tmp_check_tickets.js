import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
dotenv.config();

const supabase = createClient(
    process.env.VITE_SUPABASE_URL || '',
    process.env.VITE_SUPABASE_PUBLISHABLE_KEY || ''
);

async function checkSchema() {
    // 1. Tentar ler
    const { data: ticketsData, error: ticketsError } = await supabase
        .from('support_tickets')
        .select('*');

    console.log('tickets before insert:', ticketsData?.length, 'error:', ticketsError);

    // 2. Criar um usuário de teste (se precisar, ou pegar um existente)
    const { data: profiles } = await supabase.from('profiles').select('id').limit(1);
    if (profiles && profiles.length > 0) {
        const userId = profiles[0].id;
        console.log('Using user_id for insert:', userId);

        // 3. Inserir ticket
        const { data: insertData, error: insertError } = await supabase
            .from('support_tickets')
            .insert({
                user_id: userId,
                ticket_number: 'TEST-' + Math.floor(Math.random() * 10000),
                assunto: 'Teste de Inserção',
                mensagem: 'Testando RLS do suporte'
            })
            .select();

        console.log('insert data:', insertData, 'error:', insertError);

        // 4. Ler de novo
        const { data: afterData } = await supabase.from('support_tickets').select('*');
        console.log('tickets after insert:', afterData?.length);
    } else {
        console.log('No profiles found to use for user_id');
    }
}

checkSchema().catch(console.error);
