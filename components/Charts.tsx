import React from 'react';
import { PieChart, Pie, Cell, ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid } from 'recharts';
import { ExpenseRecord, Category, Recipe } from '../types';

interface Props {
  expenses: ExpenseRecord[];
  recipes?: Recipe[];
}

// Updated Palette: Violet, Emerald, Amber, Rose, Cyan, Indigo
const COLORS = ['#8B5CF6', '#10B981', '#F59E0B', '#F43F5E', '#06B6D4', '#6366F1', '#EC4899'];

const CATEGORY_NAMES: Record<string, string> = {
  'Produce': 'Овощи/Фрукты',
  'Dairy': 'Молочное',
  'Meat': 'Мясо',
  'Pantry': 'Бакалея',
  'Beverages': 'Напитки',
  'Frozen': 'Заморозка',
  'Other': 'Другое'
};

const formatUZS = (val: number) => {
    return val.toLocaleString('uz-UZ') + ' UZS';
}

export const ExpenseAnalytics: React.FC<Props> = ({ expenses, recipes = [] }) => {
  
  // Aggregate data by category
  const dataMap = expenses.reduce((acc, curr) => {
    acc[curr.category] = (acc[curr.category] || 0) + curr.amount;
    return acc;
  }, {} as Record<string, number>);

  const pieData = Object.keys(dataMap).map((key) => ({
    name: CATEGORY_NAMES[key] || key,
    value: dataMap[key],
  }));

  // Aggregate by Date (Last 7 days)
  const chartData = expenses.slice(-10).map((e, i) => ({
      name: new Date(e.date).toLocaleDateString('ru-RU', {weekday: 'short'}),
      amount: e.amount
  }));

  // Recipe Stats
  const recipeData = recipes
    .filter(r => r.timesCooked > 0)
    .map(r => ({ name: r.title.substring(0, 15) + (r.title.length>15 ? '...' : ''), count: r.timesCooked }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 5);

  if (expenses.length === 0 && recipes.length === 0) {
      return <div className="p-12 text-center text-slate-400 font-medium">Нет данных. Отсканируйте чек или приготовьте блюдо!</div>
  }

  return (
    <div className="space-y-4">
      
      {/* Recipe Analytics */}
      {recipeData.length > 0 && (
          <div className="bg-white dark:bg-slate-900 p-5 rounded-3xl shadow-sm border border-slate-100 dark:border-slate-800">
            <h3 className="font-bold text-slate-700 dark:text-slate-200 mb-4 text-sm uppercase tracking-wide">Популярные рецепты</h3>
            <div className="h-40 w-full">
                <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={recipeData} layout="vertical">
                        <XAxis type="number" hide />
                        <YAxis dataKey="name" type="category" width={100} tick={{fontSize: 11, fill: '#64748B'}} axisLine={false} tickLine={false} />
                        <Tooltip cursor={{fill: 'transparent'}} contentStyle={{borderRadius: '12px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)'}} />
                        <Bar dataKey="count" fill="#8B5CF6" radius={[0, 6, 6, 0]} barSize={20} />
                    </BarChart>
                </ResponsiveContainer>
            </div>
          </div>
      )}

      <div className="bg-white dark:bg-slate-900 p-5 rounded-3xl shadow-sm border border-slate-100 dark:border-slate-800">
        <h3 className="font-bold text-slate-700 dark:text-slate-200 mb-4 text-sm uppercase tracking-wide">Расходы по категориям</h3>
        <div className="h-56 w-full">
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie
                data={pieData}
                cx="50%"
                cy="50%"
                innerRadius={50}
                outerRadius={70}
                paddingAngle={5}
                dataKey="value"
                stroke="none"
              >
                {pieData.map((entry, index) => (
                  <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                ))}
              </Pie>
              <Tooltip formatter={(value: number) => formatUZS(value)} contentStyle={{borderRadius: '12px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)'}} />
            </PieChart>
          </ResponsiveContainer>
        </div>
        <div className="flex flex-wrap gap-2 justify-center mt-4">
            {pieData.map((entry, index) => (
                <div key={entry.name} className="flex items-center text-xs font-medium text-slate-600 dark:text-slate-300 bg-slate-50 dark:bg-slate-800 px-2 py-1 rounded-full border border-slate-100 dark:border-slate-700">
                    <span className="w-2 h-2 rounded-full mr-2" style={{backgroundColor: COLORS[index % COLORS.length]}}></span>
                    {entry.name}
                </div>
            ))}
        </div>
      </div>

      <div className="bg-white dark:bg-slate-900 p-5 rounded-3xl shadow-sm border border-slate-100 dark:border-slate-800">
        <h3 className="font-bold text-slate-700 dark:text-slate-200 mb-4 text-sm uppercase tracking-wide">Недавняя активность</h3>
        <div className="h-40 w-full">
            <ResponsiveContainer width="100%" height="100%">
                <BarChart data={chartData}>
                    <XAxis dataKey="name" tick={{fontSize: 10, fill: '#64748B'}} axisLine={false} tickLine={false} dy={10} />
                    <YAxis hide />
                    <Tooltip formatter={(value: number) => formatUZS(value)} cursor={{fill: '#F1F5F9', radius: 6}} contentStyle={{borderRadius: '12px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)'}} />
                    <Bar dataKey="amount" fill="#10B981" radius={[4, 4, 4, 4]} barSize={24} />
                </BarChart>
            </ResponsiveContainer>
        </div>
      </div>
    </div>
  );
};