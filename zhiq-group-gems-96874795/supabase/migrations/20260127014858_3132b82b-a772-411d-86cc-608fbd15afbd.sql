-- Adicionar política RLS para permitir que usuários deletem seus próprios grupos
CREATE POLICY "Users can delete their own motoboy groups"
ON public.motoboy_whatsapp_groups
FOR DELETE
USING (auth.uid() = user_id);