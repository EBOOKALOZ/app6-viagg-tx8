const fs = require('fs');
let txt = fs.readFileSync('src/pages/admin/AdminVehicleOverview.tsx', 'utf8');

const t2 = txt.split('\n');

const importStr = 'import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";';

const filtered = t2.filter((line, i) => {
    // Keep only the first occurrence of the useQuery, supabase, toast lines
    if (line.includes('import { useQuery, useMutation, useQueryClient }') && i > 50) return false;
    if (line.includes('import { supabase } from "@/integrations/supabase/client";') && i > 50) return false;
    if (line.includes('import { toast } from "sonner";') && i > 50) return false;
    return true;
});

fs.writeFileSync('src/pages/admin/AdminVehicleOverview.tsx', filtered.join('\n'));
console.log('Fixed imports');
