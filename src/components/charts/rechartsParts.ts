// The recharts pieces lazyRecharts.tsx hands out, loaded from there with import(). Naming them
// here, instead of importing the whole 'recharts' namespace dynamically, keeps the library
// tree-shaken (a dynamic namespace import pulls in every export, about 70 KB more).
export {
  ResponsiveContainer, BarChart, Bar, LineChart, Line, AreaChart, Area, ComposedChart, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend, ReferenceLine,
} from 'recharts';
