import React from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, Legend, LineChart, Line } from "recharts";

const data = [
  { name: "Jan", visualizacoes: 4000, contatos: 240, vendas: 2400 },
  { name: "Fev", visualizacoes: 3000, contatos: 139, vendas: 2210 },
  { name: "Mar", visualizacoes: 2000, contatos: 980, vendas: 2290 },
  { name: "Abr", visualizacoes: 2780, contatos: 390, vendas: 2000 },
  { name: "Mai", visualizacoes: 1890, contatos: 480, vendas: 2181 },
  { name: "Jun", visualizacoes: 2390, contatos: 380, vendas: 2500 },
  { name: "Jul", visualizacoes: 3490, contatos: 430, vendas: 2100 },
];

export function CommercialCharts() {
  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Evolução de Visualizações e Contatos</CardTitle>
        </CardHeader>
        <CardContent className="h-[300px]">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={data} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
              <XAxis dataKey="name" fontSize={12} tickLine={false} axisLine={false} />
              <YAxis fontSize={12} tickLine={false} axisLine={false} />
              <Tooltip cursor={{ fill: "transparent" }} />
              <Legend iconType="circle" wrapperStyle={{ fontSize: '12px' }} />
              <Bar dataKey="visualizacoes" name="Visualizações" fill="#3b82f6" radius={[4, 4, 0, 0]} />
              <Bar dataKey="contatos" name="Contatos" fill="#10b981" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>
      
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Receita (Histórico de Vendas)</CardTitle>
        </CardHeader>
        <CardContent className="h-[300px]">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={data} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
              <XAxis dataKey="name" fontSize={12} tickLine={false} axisLine={false} />
              <YAxis fontSize={12} tickLine={false} axisLine={false} />
              <Tooltip />
              <Legend iconType="circle" wrapperStyle={{ fontSize: '12px' }} />
              <Line type="monotone" dataKey="vendas" name="Receita Bruta (R$)" stroke="#8b5cf6" strokeWidth={3} dot={{ r: 4 }} activeDot={{ r: 6 }} />
            </LineChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>
    </div>
  );
}
